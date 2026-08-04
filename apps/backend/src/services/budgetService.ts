import { randomUUID } from 'node:crypto';
import { upsertBudgetInputSchema, yearMonthSchema, type Budget } from '@household/shared';
import type { BudgetRepository } from '../repository/budgetRepository';

export async function listBudgets(
  repository: BudgetRepository,
  householdId: string,
  rawYearMonth: unknown,
): Promise<Budget[]> {
  const yearMonth = yearMonthSchema.parse(rawYearMonth);
  const budgets = await repository.listByHouseholdAndMonth(householdId, yearMonth);
  return budgets.slice().sort((a, b) => a.categoryId.localeCompare(b.categoryId));
}

/**
 * Create-or-replace. The sort key (yearMonth + categoryId) is naturally idempotent, so this
 * always writes a fresh item rather than fetching an existing one first (see
 * handlers/upsertBudget.ts and infra/lib/api-stack.ts, which only grants PutItem for this route).
 */
export async function upsertBudget(
  repository: BudgetRepository,
  householdId: string,
  rawInput: unknown,
): Promise<Budget> {
  const input = upsertBudgetInputSchema.parse(rawInput);
  const now = new Date().toISOString();
  const budget: Budget = {
    id: randomUUID(),
    householdId,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  await repository.put(budget);
  return budget;
}
