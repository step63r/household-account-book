import { randomUUID } from 'node:crypto';
import {
  createSubscriptionInputSchema,
  reorderSubscriptionsInputSchema,
  updateSubscriptionInputSchema,
  type Subscription,
  type SubscriptionFrequency,
} from '@household/shared';
import type { SubscriptionRepository } from '../repository/subscriptionRepository';
import { HttpError, NotFoundError } from '../lib/errors';

/**
 * frequency=yearly のときはbillingMonthが必須、monthlyのときはnullを要求する
 * （transactionServiceのassertCategoryIdRuleと同じ流儀。zodではなくサービス層で強制する）。
 */
function assertBillingScheduleRule(
  frequency: SubscriptionFrequency,
  billingMonth: number | null,
): void {
  if (frequency === 'yearly') {
    if (billingMonth === null) {
      throw new HttpError(400, `billingMonth is required when frequency is "${frequency}"`);
    }
    return;
  }
  if (billingMonth !== null) {
    throw new HttpError(400, `billingMonth must be null when frequency is "${frequency}"`);
  }
}

export async function listSubscriptions(
  repository: SubscriptionRepository,
  householdId: string,
): Promise<Subscription[]> {
  const items = await repository.listByHousehold(householdId);
  return items.slice().sort((a, b) => {
    const aOrder = a.sortOrder ?? Number.POSITIVE_INFINITY;
    const bOrder = b.sortOrder ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function createSubscription(
  repository: SubscriptionRepository,
  householdId: string,
  rawInput: unknown,
): Promise<Subscription> {
  const input = createSubscriptionInputSchema.parse(rawInput);
  assertBillingScheduleRule(input.frequency, input.billingMonth);

  const existing = await repository.listByHousehold(householdId);
  // Math.max over existing sortOrder values (not existing.length): some existing rows may have
  // sortOrder === undefined (legacy data), and .length could place a new item earlier than
  // legacy items once listSubscriptions sorts them.
  const nextSortOrder = existing.reduce((max, s) => Math.max(max, s.sortOrder ?? -1), -1) + 1;

  const now = new Date().toISOString();
  const subscription: Subscription = {
    id: randomUUID(),
    householdId,
    ...input,
    sortOrder: nextSortOrder,
    createdAt: now,
    updatedAt: now,
  };
  await repository.put(subscription);
  return subscription;
}

export async function updateSubscription(
  repository: SubscriptionRepository,
  householdId: string,
  subscriptionId: string,
  rawInput: unknown,
): Promise<Subscription> {
  const input = updateSubscriptionInputSchema.parse(rawInput);

  const existing = await repository.getById(householdId, subscriptionId);
  if (!existing) {
    throw new NotFoundError(`Subscription ${subscriptionId} not found`);
  }

  const updated: Subscription = {
    ...existing,
    ...input,
    updatedAt: new Date().toISOString(),
  };
  assertBillingScheduleRule(updated.frequency, updated.billingMonth);
  await repository.put(updated);
  return updated;
}

/**
 * サブスクリプションの並び替え（世帯全体でフラットな1リスト）。orderedIdsとDB上の全件集合が
 * 完全に一致することを検証してから、orderedIdsの並び順で0始まりのsortOrderを振り直す。
 */
export async function reorderSubscriptions(
  repository: SubscriptionRepository,
  householdId: string,
  rawInput: unknown,
): Promise<Subscription[]> {
  const input = reorderSubscriptionsInputSchema.parse(rawInput);

  const existing = await repository.listByHousehold(householdId);

  const orderedIdSet = new Set(input.orderedIds);
  if (orderedIdSet.size !== input.orderedIds.length) {
    throw new HttpError(400, 'orderedIds contains duplicate ids');
  }
  const existingIdSet = new Set(existing.map((s) => s.id));
  if (orderedIdSet.size !== existingIdSet.size) {
    throw new HttpError(400, 'orderedIds does not match the existing subscription set');
  }
  for (const id of input.orderedIds) {
    if (!existingIdSet.has(id)) {
      throw new HttpError(400, `orderedIds contains unknown subscription id: ${id}`);
    }
  }

  const byId = new Map(existing.map((s) => [s.id, s]));
  const now = new Date().toISOString();
  const updated: Subscription[] = input.orderedIds.map((id, index) => ({
    ...byId.get(id)!,
    sortOrder: index,
    updatedAt: now,
  }));

  await repository.putAll(updated);
  return updated;
}

export async function deleteSubscription(
  repository: SubscriptionRepository,
  householdId: string,
  subscriptionId: string,
): Promise<void> {
  const existing = await repository.getById(householdId, subscriptionId);
  if (!existing) {
    throw new NotFoundError(`Subscription ${subscriptionId} not found`);
  }
  await repository.delete(householdId, subscriptionId);
}
