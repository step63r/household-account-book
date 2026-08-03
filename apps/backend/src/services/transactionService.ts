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

export async function listTransactions(
  repository: TransactionRepository,
  userId: string,
  range?: TransactionListRange,
  plan: UserPlan = 'paid',
): Promise<Transaction[]> {
  // free plan: silently narrow to the accessible window instead of erroring - the caller
  // just gets the last FREE_PLAN_HISTORY_MONTHS worth of results.
  const clampedRange: TransactionListRange = { ...range, from: clampFromParam(plan, range?.from) };
  const transactions = await repository.listByUser(userId, clampedRange);
  return transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export async function createTransaction(
  repository: TransactionRepository,
  userId: string,
  rawInput: unknown,
  plan: UserPlan = 'paid',
): Promise<Transaction> {
  const input = createTransactionInputSchema.parse(rawInput);
  assertCategoryIdRule(input.type, input.categoryId);
  assertWithinPlanWindow(plan, input.date);

  const now = new Date().toISOString();
  const transaction: Transaction = {
    id: randomUUID(),
    userId,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  await repository.put(transaction);
  return transaction;
}

export async function updateTransaction(
  repository: TransactionRepository,
  userId: string,
  transactionId: string,
  rawInput: unknown,
  plan: UserPlan = 'paid',
): Promise<Transaction> {
  const input = updateTransactionInputSchema.parse(rawInput);

  const existing = await repository.getById(userId, transactionId);
  if (!existing) {
    throw new NotFoundError(`Transaction ${transactionId} not found`);
  }
  // Reject editing a transaction that's already outside the free-plan window...
  assertWithinPlanWindow(plan, existing.date);

  const updated: Transaction = {
    ...existing,
    ...input,
    updatedAt: new Date().toISOString(),
  };
  assertCategoryIdRule(updated.type, updated.categoryId);
  // ...and reject moving one into that window via a `date` change.
  assertWithinPlanWindow(plan, updated.date);

  // `date` is part of the sort key (TXN#<date>#<txnId>), so a date change is a key change:
  // the old item must be removed before the new one is written, not updated in place.
  if (updated.date !== existing.date) {
    await repository.delete(userId, existing.date, transactionId);
  }
  await repository.put(updated);
  return updated;
}

export async function deleteTransaction(
  repository: TransactionRepository,
  userId: string,
  transactionId: string,
  plan: UserPlan = 'paid',
): Promise<void> {
  const existing = await repository.getById(userId, transactionId);
  if (!existing) {
    throw new NotFoundError(`Transaction ${transactionId} not found`);
  }
  assertWithinPlanWindow(plan, existing.date);
  await repository.delete(userId, existing.date, transactionId);
}
