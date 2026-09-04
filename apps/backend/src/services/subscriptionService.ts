import { randomUUID } from 'node:crypto';
import {
  createSubscriptionInputSchema,
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
  return repository.listByHousehold(householdId);
}

export async function createSubscription(
  repository: SubscriptionRepository,
  householdId: string,
  rawInput: unknown,
): Promise<Subscription> {
  const input = createSubscriptionInputSchema.parse(rawInput);
  assertBillingScheduleRule(input.frequency, input.billingMonth);

  const now = new Date().toISOString();
  const subscription: Subscription = {
    id: randomUUID(),
    householdId,
    ...input,
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
