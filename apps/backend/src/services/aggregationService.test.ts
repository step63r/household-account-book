import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import type { Budget, Category, Transaction } from '@household/shared';
import { FakeBudgetRepository } from '../repository/fakeBudgetRepository';
import { FakeCategoryRepository } from '../repository/fakeCategoryRepository';
import { FakeTransactionRepository } from '../repository/fakeTransactionRepository';
import { getBudgetVariance, getCategoryPivot, getTrend } from './aggregationService';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function makeTransaction(overrides: Partial<Transaction> & Pick<Transaction, 'date' | 'type' | 'amount'>): Transaction {
  const now = new Date().toISOString();
  return {
    id: nextId('txn'),
    userId: 'user-1',
    categoryId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> & Pick<Category, 'id' | 'name'>): Category {
  const now = new Date().toISOString();
  return {
    userId: 'user-1',
    type: 'variable',
    tooltip: undefined,
    isPreset: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeBudget(overrides: Partial<Budget> & Pick<Budget, 'yearMonth' | 'categoryId' | 'amount'>): Budget {
  const now = new Date().toISOString();
  return {
    id: nextId('budget'),
    userId: 'user-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('getTrend', () => {
  it('rejects a request missing required query params', async () => {
    const repository = new FakeTransactionRepository();

    await expect(getTrend(repository, 'user-1', {})).rejects.toThrow(ZodError);
  });

  it('excludes transfer from income/expense but sums it separately per day', async () => {
    const repository = new FakeTransactionRepository();
    await repository.put(makeTransaction({ date: '2026-07-10', type: 'income', amount: 5000, categoryId: null }));
    await repository.put(makeTransaction({ date: '2026-07-10', type: 'expense', amount: 1200, categoryId: 'c1' }));
    await repository.put(makeTransaction({ date: '2026-07-10', type: 'transfer', amount: 10000, categoryId: null }));

    const trend = await getTrend(repository, 'user-1', {
      granularity: 'day',
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(trend).toEqual([{ period: '2026-07-10', income: 5000, expense: 1200, transfer: 10000 }]);
  });

  it('buckets by month when granularity is month', async () => {
    const repository = new FakeTransactionRepository();
    await repository.put(makeTransaction({ date: '2026-07-01', type: 'expense', amount: 1000, categoryId: 'c1' }));
    await repository.put(makeTransaction({ date: '2026-07-31', type: 'expense', amount: 2000, categoryId: 'c1' }));

    const trend = await getTrend(repository, 'user-1', {
      granularity: 'month',
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(trend).toEqual([{ period: '2026-07', income: 0, expense: 3000, transfer: 0 }]);
  });

  it('buckets by ISO week when granularity is week', async () => {
    const repository = new FakeTransactionRepository();
    // 2026-07-06 is a Monday - ISO week 28 of 2026.
    await repository.put(makeTransaction({ date: '2026-07-06', type: 'expense', amount: 500, categoryId: 'c1' }));
    await repository.put(makeTransaction({ date: '2026-07-08', type: 'expense', amount: 700, categoryId: 'c1' }));

    const trend = await getTrend(repository, 'user-1', {
      granularity: 'week',
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(trend).toEqual([{ period: '2026-W28', income: 0, expense: 1200, transfer: 0 }]);
  });

  it('buckets by year when granularity is year', async () => {
    const repository = new FakeTransactionRepository();
    await repository.put(makeTransaction({ date: '2026-02-01', type: 'expense', amount: 1000, categoryId: 'c1' }));
    await repository.put(makeTransaction({ date: '2026-11-15', type: 'income', amount: 3000, categoryId: null }));

    const trend = await getTrend(repository, 'user-1', {
      granularity: 'year',
      from: '2026-01-01',
      to: '2026-12-31',
    });

    expect(trend).toEqual([{ period: '2026', income: 3000, expense: 1000, transfer: 0 }]);
  });

  it('resolves the full history when from is omitted', async () => {
    const repository = new FakeTransactionRepository();
    await repository.put(makeTransaction({ date: '2010-01-05', type: 'expense', amount: 1500, categoryId: 'c1' }));
    await repository.put(makeTransaction({ date: '2026-07-10', type: 'income', amount: 2500, categoryId: null }));

    const trend = await getTrend(repository, 'user-1', {
      granularity: 'month',
      to: '2026-12-31',
    });

    expect(trend).toEqual([
      { period: '2010-01', income: 0, expense: 1500, transfer: 0 },
      { period: '2026-07', income: 2500, expense: 0, transfer: 0 },
    ]);
  });
});

describe('getCategoryPivot', () => {
  it('rejects a request missing required query params', async () => {
    const transactionRepository = new FakeTransactionRepository();
    const categoryRepository = new FakeCategoryRepository();

    await expect(getCategoryPivot(transactionRepository, categoryRepository, 'user-1', {})).rejects.toThrow(
      ZodError,
    );
  });

  it('excludes income and transfer, pivots expense by category and period, defaults to month', async () => {
    const transactionRepository = new FakeTransactionRepository();
    const categoryRepository = new FakeCategoryRepository();
    await categoryRepository.put(makeCategory({ id: 'c1', name: '食費' }));
    await transactionRepository.put(
      makeTransaction({ date: '2026-07-05', type: 'expense', amount: 1000, categoryId: 'c1' }),
    );
    await transactionRepository.put(
      makeTransaction({ date: '2026-07-20', type: 'expense', amount: 500, categoryId: 'c1' }),
    );
    await transactionRepository.put(
      makeTransaction({ date: '2026-07-05', type: 'income', amount: 300000, categoryId: 'c1' }),
    );
    await transactionRepository.put(
      makeTransaction({ date: '2026-07-05', type: 'transfer', amount: 50000, categoryId: null }),
    );

    const pivot = await getCategoryPivot(transactionRepository, categoryRepository, 'user-1', {
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(pivot).toEqual([
      { categoryId: 'c1', categoryName: '食費', amountsByPeriod: { '2026-07': 1500 } },
    ]);
  });

  it('falls back to 未分類 when the category no longer exists', async () => {
    const transactionRepository = new FakeTransactionRepository();
    const categoryRepository = new FakeCategoryRepository();
    await transactionRepository.put(
      makeTransaction({ date: '2026-07-05', type: 'expense', amount: 800, categoryId: 'missing-category' }),
    );

    const pivot = await getCategoryPivot(transactionRepository, categoryRepository, 'user-1', {
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(pivot[0]!.categoryName).toBe('未分類');
  });
});

describe('getBudgetVariance', () => {
  it('rejects an invalid yearMonth', async () => {
    const transactionRepository = new FakeTransactionRepository();
    const budgetRepository = new FakeBudgetRepository();
    const categoryRepository = new FakeCategoryRepository();

    await expect(
      getBudgetVariance(transactionRepository, budgetRepository, categoryRepository, 'user-1', {
        yearMonth: 'not-a-month',
      }),
    ).rejects.toThrow(ZodError);
  });

  it('computes variance for categories with a budget, an actual, or both', async () => {
    const transactionRepository = new FakeTransactionRepository();
    const budgetRepository = new FakeBudgetRepository();
    const categoryRepository = new FakeCategoryRepository();
    await categoryRepository.put(makeCategory({ id: 'c1', name: '食費' }));
    await categoryRepository.put(makeCategory({ id: 'c2', name: '交通費' }));
    // c1: budget + actual. c2: actual only (over-budget-less category). c3: budget only (unused).
    await budgetRepository.put(makeBudget({ yearMonth: '2026-07', categoryId: 'c1', amount: 30000 }));
    await budgetRepository.put(makeBudget({ yearMonth: '2026-07', categoryId: 'c3', amount: 5000 }));
    await transactionRepository.put(
      makeTransaction({ date: '2026-07-10', type: 'expense', amount: 35000, categoryId: 'c1' }),
    );
    await transactionRepository.put(
      makeTransaction({ date: '2026-07-10', type: 'expense', amount: 1200, categoryId: 'c2' }),
    );
    // income/transfer must never count toward actualAmount.
    await transactionRepository.put(
      makeTransaction({ date: '2026-07-10', type: 'income', amount: 300000, categoryId: 'c1' }),
    );
    // Outside the requested month - must be excluded.
    await transactionRepository.put(
      makeTransaction({ date: '2026-08-01', type: 'expense', amount: 9999, categoryId: 'c1' }),
    );

    const rows = await getBudgetVariance(transactionRepository, budgetRepository, categoryRepository, 'user-1', {
      yearMonth: '2026-07',
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        { categoryId: 'c1', categoryName: '食費', budgetAmount: 30000, actualAmount: 35000, varianceAmount: 5000 },
        { categoryId: 'c2', categoryName: '交通費', budgetAmount: 0, actualAmount: 1200, varianceAmount: 1200 },
        { categoryId: 'c3', categoryName: '未分類', budgetAmount: 5000, actualAmount: 0, varianceAmount: -5000 },
      ]),
    );
    expect(rows).toHaveLength(3);
  });

  it('sorts fixed categories before variable, then by sortOrder, with unclassified rows last', async () => {
    const transactionRepository = new FakeTransactionRepository();
    const budgetRepository = new FakeBudgetRepository();
    const categoryRepository = new FakeCategoryRepository();
    // Alphabetical-by-name order would be: 家賃(house rent) < 食費(food) < 通信費(comms) < 未分類.
    // The expected order (fixed before variable, then sortOrder) is: 家賃(fixed,0) < 通信費(variable,0)
    // < 食費(variable,1) < 未分類(missing, last).
    await categoryRepository.put(makeCategory({ id: 'c-rent', name: '家賃', type: 'fixed', sortOrder: 0 }));
    await categoryRepository.put(makeCategory({ id: 'c-comms', name: '通信費', type: 'variable', sortOrder: 0 }));
    await categoryRepository.put(makeCategory({ id: 'c-food', name: '食費', type: 'variable', sortOrder: 1 }));
    await budgetRepository.put(makeBudget({ yearMonth: '2026-07', categoryId: 'c-rent', amount: 80000 }));
    await budgetRepository.put(makeBudget({ yearMonth: '2026-07', categoryId: 'c-comms', amount: 8000 }));
    await budgetRepository.put(makeBudget({ yearMonth: '2026-07', categoryId: 'c-food', amount: 30000 }));
    await budgetRepository.put(makeBudget({ yearMonth: '2026-07', categoryId: 'missing-category', amount: 5000 }));

    const rows = await getBudgetVariance(transactionRepository, budgetRepository, categoryRepository, 'user-1', {
      yearMonth: '2026-07',
    });

    expect(rows.map((row) => row.categoryId)).toEqual(['c-rent', 'c-comms', 'c-food', 'missing-category']);
  });
});
