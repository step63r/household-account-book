import type { Budget } from '@household/shared';
import type { BudgetRepository } from './budgetRepository';

/**
 * In-memory BudgetRepository for unit tests. Never touches AWS - mirrors the semantics of
 * DynamoBudgetRepository closely enough to exercise service/handler logic in isolation.
 */
export class FakeBudgetRepository implements BudgetRepository {
  private readonly itemsByKey = new Map<string, Budget>();

  private key(userId: string, yearMonth: string, categoryId: string): string {
    return `${userId}#${yearMonth}#${categoryId}`;
  }

  async listByUserAndMonth(userId: string, yearMonth: string): Promise<Budget[]> {
    return [...this.itemsByKey.values()].filter(
      (budget) => budget.userId === userId && budget.yearMonth === yearMonth,
    );
  }

  async put(budget: Budget): Promise<void> {
    this.itemsByKey.set(this.key(budget.userId, budget.yearMonth, budget.categoryId), budget);
  }
}
