import type { Budget } from '@household/shared';
import type { BudgetRepository } from './budgetRepository';

/**
 * In-memory BudgetRepository for unit tests. Never touches AWS - mirrors the semantics of
 * DynamoBudgetRepository closely enough to exercise service/handler logic in isolation.
 */
export class FakeBudgetRepository implements BudgetRepository {
  private readonly itemsByKey = new Map<string, Budget>();

  private key(householdId: string, yearMonth: string, categoryId: string): string {
    return `${householdId}#${yearMonth}#${categoryId}`;
  }

  async listByHouseholdAndMonth(householdId: string, yearMonth: string): Promise<Budget[]> {
    return [...this.itemsByKey.values()].filter(
      (budget) => budget.householdId === householdId && budget.yearMonth === yearMonth,
    );
  }

  async put(budget: Budget): Promise<void> {
    this.itemsByKey.set(this.key(budget.householdId, budget.yearMonth, budget.categoryId), budget);
  }
}
