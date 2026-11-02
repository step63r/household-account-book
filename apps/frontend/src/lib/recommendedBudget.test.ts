import { describe, expect, it } from 'vitest';
import type { Transaction } from '@household/shared';
import { recommendedSubscriptionBudget } from './recommendedBudget';

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx',
    householdId: 'h',
    createdBy: 'u',
    date: '2026-10-01',
    type: 'expense',
    categoryId: 'cat1',
    amount: 1000,
    memo: 'Netflix',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const target = { name: 'Netflix', categoryId: 'cat1' };

describe('recommendedSubscriptionBudget', () => {
  it('該当する取引が無ければnullを返す', () => {
    expect(recommendedSubscriptionBudget([], target)).toBeNull();
    expect(recommendedSubscriptionBudget([tx({ memo: 'Spotify' })], target)).toBeNull();
  });

  it('名前が空・費目未選択ならnullを返す', () => {
    expect(recommendedSubscriptionBudget([tx({})], { name: '  ', categoryId: 'cat1' })).toBeNull();
    expect(recommendedSubscriptionBudget([tx({})], { name: 'Netflix', categoryId: '' })).toBeNull();
  });

  it('平均を1の位で切り上げる（123.33円 → 130円）', () => {
    const txs = [tx({ amount: 100 }), tx({ amount: 100 }), tx({ amount: 170 })];
    expect(recommendedSubscriptionBudget(txs, target)).toBe(130);
  });

  it('平均が10円ちょうどの倍数ならそのまま返す', () => {
    const txs = [tx({ amount: 1000 }), tx({ amount: 1400 })];
    expect(recommendedSubscriptionBudget(txs, target)).toBe(1200);
  });

  it('同じ月に複数件あっても件数で割る（13件なら13で割る）', () => {
    const txs = [...Array.from({ length: 12 }, () => tx({ amount: 1000 })), tx({ amount: 1130 })];
    // (12000 + 1130) / 13 = 1010
    expect(recommendedSubscriptionBudget(txs, target)).toBe(1010);
  });

  it('費目・種別・名前が異なる取引は除外する', () => {
    const txs = [
      tx({ amount: 1000 }),
      tx({ amount: 9000, categoryId: 'cat2' }),
      tx({ amount: 9000, type: 'transfer', categoryId: null }),
      tx({ amount: 9000, memo: 'Netflix Premium' }),
      tx({ amount: 9000, memo: undefined }),
    ];
    expect(recommendedSubscriptionBudget(txs, target)).toBe(1000);
  });

  it('名前の前後の空白は無視して一致判定する', () => {
    expect(
      recommendedSubscriptionBudget([tx({ memo: ' Netflix ' })], { ...target, name: 'Netflix  ' }),
    ).toBe(1000);
  });
});
