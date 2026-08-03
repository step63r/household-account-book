import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { FakeBudgetRepository } from '../repository/fakeBudgetRepository';
import { listBudgets, upsertBudget } from './budgetService';

describe('upsertBudget', () => {
  it('rejects invalid input', async () => {
    const repository = new FakeBudgetRepository();

    await expect(
      upsertBudget(repository, 'user-1', { yearMonth: '2026-13', categoryId: 'c1', amount: 1000 }),
    ).rejects.toThrow(ZodError);
  });

  it('creates and persists a budget', async () => {
    const repository = new FakeBudgetRepository();

    const budget = await upsertBudget(repository, 'user-1', {
      yearMonth: '2026-07',
      categoryId: 'category-1',
      amount: 30000,
    });

    expect(budget.userId).toBe('user-1');
    expect(budget.amount).toBe(30000);
    await expect(repository.listByUserAndMonth('user-1', '2026-07')).resolves.toEqual([budget]);
  });

  it('replaces the existing budget for the same yearMonth+categoryId', async () => {
    const repository = new FakeBudgetRepository();
    await upsertBudget(repository, 'user-1', {
      yearMonth: '2026-07',
      categoryId: 'category-1',
      amount: 30000,
    });

    const updated = await upsertBudget(repository, 'user-1', {
      yearMonth: '2026-07',
      categoryId: 'category-1',
      amount: 45000,
    });

    const monthBudgets = await repository.listByUserAndMonth('user-1', '2026-07');
    expect(monthBudgets).toHaveLength(1);
    expect(monthBudgets[0]!.amount).toBe(45000);
    expect(updated.amount).toBe(45000);
  });
});

describe('listBudgets', () => {
  it('rejects an invalid yearMonth', async () => {
    const repository = new FakeBudgetRepository();

    await expect(listBudgets(repository, 'user-1', 'not-a-month')).rejects.toThrow(ZodError);
  });

  it('rejects a missing yearMonth', async () => {
    const repository = new FakeBudgetRepository();

    await expect(listBudgets(repository, 'user-1', undefined)).rejects.toThrow(ZodError);
  });

  it("returns only the caller's budgets for the requested month", async () => {
    const repository = new FakeBudgetRepository();
    await upsertBudget(repository, 'user-1', {
      yearMonth: '2026-07',
      categoryId: 'c1',
      amount: 1000,
    });
    await upsertBudget(repository, 'user-1', {
      yearMonth: '2026-08',
      categoryId: 'c1',
      amount: 2000,
    });
    await upsertBudget(repository, 'user-2', {
      yearMonth: '2026-07',
      categoryId: 'c1',
      amount: 3000,
    });

    const julyBudgets = await listBudgets(repository, 'user-1', '2026-07');

    expect(julyBudgets).toHaveLength(1);
    expect(julyBudgets[0]!.amount).toBe(1000);
  });
});
