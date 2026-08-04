import type { Transaction } from '@household/shared';
import type { TransactionListRange, TransactionRepository } from './transactionRepository';

/**
 * In-memory TransactionRepository for unit tests. Never touches AWS - mirrors the semantics
 * of DynamoTransactionRepository closely enough to exercise service/handler logic in isolation.
 */
export class FakeTransactionRepository implements TransactionRepository {
  private readonly itemsByKey = new Map<string, Transaction>();

  private key(householdId: string, transactionId: string): string {
    return `${householdId}#${transactionId}`;
  }

  async listByHousehold(householdId: string, range?: TransactionListRange): Promise<Transaction[]> {
    let transactions = [...this.itemsByKey.values()].filter(
      (transaction) => transaction.householdId === householdId,
    );
    if (range?.from) {
      transactions = transactions.filter((transaction) => transaction.date >= range.from!);
    }
    if (range?.to) {
      transactions = transactions.filter((transaction) => transaction.date <= range.to!);
    }
    return transactions;
  }

  async getById(householdId: string, transactionId: string): Promise<Transaction | undefined> {
    return this.itemsByKey.get(this.key(householdId, transactionId));
  }

  async put(transaction: Transaction): Promise<void> {
    this.itemsByKey.set(this.key(transaction.householdId, transaction.id), transaction);
  }

  async delete(householdId: string, _date: string, transactionId: string): Promise<void> {
    this.itemsByKey.delete(this.key(householdId, transactionId));
  }
}
