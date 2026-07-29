import { describe, expect, it } from 'vitest';
import type { TrendPoint } from '@household/shared';
import { toCumulativeSeries } from './assetFormation';

function point(period: string, transfer: number): TrendPoint {
  return { period, income: 0, expense: 0, transfer };
}

describe('toCumulativeSeries', () => {
  it('空配列は空配列を返す', () => {
    expect(toCumulativeSeries([])).toEqual([]);
  });

  it('昇順のTrendPoint[]のtransferを積み上げた累計を返す', () => {
    const points = [point('2026-01', 10000), point('2026-02', 5000), point('2026-03', -2000)];
    expect(toCumulativeSeries(points)).toEqual([
      { period: '2026-01', amount: 10000 },
      { period: '2026-02', amount: 15000 },
      { period: '2026-03', amount: 13000 },
    ]);
  });

  it('transferが0の期間も累計額を引き継いで出力する', () => {
    const points = [point('2026-01', 3000), point('2026-02', 0)];
    expect(toCumulativeSeries(points)).toEqual([
      { period: '2026-01', amount: 3000 },
      { period: '2026-02', amount: 3000 },
    ]);
  });
});
