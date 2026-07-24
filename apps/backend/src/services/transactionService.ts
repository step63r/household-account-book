import { randomUUID } from 'node:crypto';
import {
  createTransactionInputSchema,
  updateTransactionInputSchema,
  type Transaction,
  type TransactionType,
} from '@household/shared';
import type { TransactionListRange, TransactionRepository } from '../repository/transactionRepository';
import { HttpError, NotFoundError } from '../lib/errors';

/** income/expense には費目が必須、transfer には費目を付けない - CLAUDE.mdの取引種別の定義通り。 */
function assertCategoryIdRule(type: TransactionType, categoryId: string | null): void {
  if (type === 'transfer') {
    if (categoryId !== null) {
      throw new HttpError(400, 'categoryId must be null when type is "transfer"');
    }
    return;
  }
  if (categoryId === null) {
    throw new HttpError(400, `categoryId is required when type is "${type}"`);
  }
}

export async function listTransactions(
  repository: TransactionRepository,
  userId: string,
  range?: TransactionListRange,
): Promise<Transaction[]> {
  const transactions = await repository.listByUser(userId, range);
  return transactions.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export async function createTransaction(
  repository: TransactionRepository,
  userId: string,
  rawInput: unknown,
): Promise<Transaction> {
  const input = createTransactionInputSchema.parse(rawInput);
  assertCategoryIdRule(input.type, input.categoryId);

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
): Promise<Transaction> {
  const input = updateTransactionInputSchema.parse(rawInput);

  const existing = await repository.getById(userId, transactionId);
  if (!existing) {
    throw new NotFoundError(`Transaction ${transactionId} not found`);
  }

  const updated: Transaction = {
    ...existing,
    ...input,
    updatedAt: new Date().toISOString(),
  };
  assertCategoryIdRule(updated.type, updated.categoryId);

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
): Promise<void> {
  const existing = await repository.getById(userId, transactionId);
  if (!existing) {
    throw new NotFoundError(`Transaction ${transactionId} not found`);
  }
  await repository.delete(userId, existing.date, transactionId);
}
