import { randomUUID } from 'node:crypto';
import {
  createTransactionInputSchema,
  updateTransactionInputSchema,
  type Transaction,
  type TransactionType,
  type UserPlan,
} from '@household/shared';
import type {
  TransactionListRange,
  TransactionRepository,
} from '../repository/transactionRepository';
import { HttpError, NotFoundError } from '../lib/errors';
import { assertWithinPlanWindow, clampFromParam } from '../lib/planAccess';

/**
 * expense には費目（categoryId）が必須。費目マスタは支出専用のため、transfer/income には
 * 費目を付けない（transferLabel/incomeSourceという別のフィールドで表現する）。
 */
function assertCategoryIdRule(type: TransactionType, categoryId: string | null): void {
  if (type === 'expense') {
    if (categoryId === null) {
      throw new HttpError(400, `categoryId is required when type is "${type}"`);
    }
    return;
  }
  if (categoryId !== null) {
    throw new HttpError(400, `categoryId must be null when type is "${type}"`);
  }
}

/**
 * income/expense の amount は正の整数のみ許可する。transfer は解約・引き出し（マイナス）も
 * 業務上正当なため符号を問わない。スキーマ側は type を問わず非ゼロ整数まで緩めてあるので、
 * income/expense の正数制約はここで課す（assertCategoryIdRule と同じ責務分担）。
 */
function assertAmountSignRule(type: TransactionType, amount: number): void {
  if (type !== 'transfer' && amount < 0) {
    throw new HttpError(400, `amount must be positive when type is "${type}"`);
  }
}

/**
 * subscriptionId で紐付けられるのは expense のみ（categoryId と同じ理由 - サブスクリプション
 * マスタは支出専用の費目マスタにぶら下がるため）。nullish（未紐付け）は常に許可する。
 */
function assertSubscriptionIdRule(
  type: TransactionType,
  subscriptionId: string | null | undefined,
): void {
  if (subscriptionId === null || subscriptionId === undefined) {
    return;
  }
  if (type !== 'expense') {
    throw new HttpError(400, `subscriptionId must be null when type is "${type}"`);
  }
}

export async function listTransactions(
  repository: TransactionRepository,
  householdId: string,
  range?: TransactionListRange,
  plan: UserPlan = 'paid',
): Promise<Transaction[]> {
  // free plan: silently narrow to the accessible window instead of erroring - the caller
  // just gets the last FREE_PLAN_HISTORY_MONTHS worth of results.
  const clampedRange: TransactionListRange = { ...range, from: clampFromParam(plan, range?.from) };
  const transactions = await repository.listByHousehold(householdId, clampedRange);
  return transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/**
 * `createdBy` は実際に入力を行ったユーザー（呼び出し元のuserId）を表す表示用フィールドで、
 * `householdId`（データの所有者＝世帯）とは独立した引数として受け取る。権限判定には使わない。
 */
export async function createTransaction(
  repository: TransactionRepository,
  householdId: string,
  createdBy: string,
  rawInput: unknown,
  plan: UserPlan = 'paid',
): Promise<Transaction> {
  const input = createTransactionInputSchema.parse(rawInput);
  assertCategoryIdRule(input.type, input.categoryId);
  assertAmountSignRule(input.type, input.amount);
  assertSubscriptionIdRule(input.type, input.subscriptionId);
  assertWithinPlanWindow(plan, input.date);

  const now = new Date().toISOString();
  const transaction: Transaction = {
    id: randomUUID(),
    householdId,
    createdBy,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  await repository.put(transaction);
  return transaction;
}

export async function updateTransaction(
  repository: TransactionRepository,
  householdId: string,
  transactionId: string,
  rawInput: unknown,
  plan: UserPlan = 'paid',
): Promise<Transaction> {
  const input = updateTransactionInputSchema.parse(rawInput);

  const existing = await repository.getById(householdId, transactionId);
  if (!existing) {
    throw new NotFoundError(`Transaction ${transactionId} not found`);
  }
  // Reject editing a transaction that's already outside the free-plan window...
  assertWithinPlanWindow(plan, existing.date);

  // `createdBy` is never part of updateTransactionInputSchema, so it's preserved automatically
  // by this spread - editing a transaction never changes who originally logged it.
  const updated: Transaction = {
    ...existing,
    ...input,
    updatedAt: new Date().toISOString(),
  };
  assertCategoryIdRule(updated.type, updated.categoryId);
  assertAmountSignRule(updated.type, updated.amount);
  assertSubscriptionIdRule(updated.type, updated.subscriptionId);
  // ...and reject moving one into that window via a `date` change.
  assertWithinPlanWindow(plan, updated.date);

  // `date` is part of the sort key (TXN#<date>#<txnId>), so a date change is a key change:
  // the old item must be removed before the new one is written, not updated in place.
  if (updated.date !== existing.date) {
    await repository.delete(householdId, existing.date, transactionId);
  }
  await repository.put(updated);
  return updated;
}

export async function deleteTransaction(
  repository: TransactionRepository,
  householdId: string,
  transactionId: string,
  plan: UserPlan = 'paid',
): Promise<void> {
  const existing = await repository.getById(householdId, transactionId);
  if (!existing) {
    throw new NotFoundError(`Transaction ${transactionId} not found`);
  }
  assertWithinPlanWindow(plan, existing.date);
  await repository.delete(householdId, existing.date, transactionId);
}
