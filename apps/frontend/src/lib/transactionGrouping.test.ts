import { describe, expect, it } from 'vitest';
import type { Transaction } from '@household/shared';
import { groupTransactionsByDate } from './transactionGrouping';

function buildTransaction(
  overrides: Partial<Transaction> & { id: string; date: string },
): Transaction {
  return {
    householdId: 'household-1',
    createdBy: 'user-1',
    type: 'expense',
    categoryId: null,
    amount: 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('groupTransactionsByDate', () => {
  it('空配列を渡すと空配列を返す', () => {
    expect(groupTransactionsByDate([])).toEqual([]);
  });

  it('連続する同日の取引を1つのグループにまとめる', () => {
    const txA = buildTransaction({ id: 'a', date: '2026-08-05' });
    const txB = buildTransaction({ id: 'b', date: '2026-08-05' });

    const groups = groupTransactionsByDate([txA, txB]);

    expect(groups).toEqual([{ date: '2026-08-05', transactions: [txA, txB] }]);
  });

  it('異なる日付は別グループになり、入力順を保持する', () => {
    const txA = buildTransaction({ id: 'a', date: '2026-08-05' });
    const txB = buildTransaction({ id: 'b', date: '2026-08-04' });

    const groups = groupTransactionsByDate([txA, txB]);

    expect(groups).toEqual([
      { date: '2026-08-05', transactions: [txA] },
      { date: '2026-08-04', transactions: [txB] },
    ]);
  });

  it('同日の取引が非連続でも1つのグループにまとまる', () => {
    const txA = buildTransaction({ id: 'a', date: '2026-08-05' });
    const txB = buildTransaction({ id: 'b', date: '2026-08-04' });
    const txC = buildTransaction({ id: 'c', date: '2026-08-05' });

    const groups = groupTransactionsByDate([txA, txB, txC]);

    expect(groups).toEqual([
      { date: '2026-08-05', transactions: [txA, txC] },
      { date: '2026-08-04', transactions: [txB] },
    ]);
  });
});
