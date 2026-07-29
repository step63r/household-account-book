import { describe, expect, it } from 'vitest';
import { formatPeriodLabel, formatPeriodTick, monthDateRange, previousYearMonth } from './date';

describe('previousYearMonth', () => {
  it('通常の月は月を1つ戻す', () => {
    expect(previousYearMonth('2026-07')).toBe('2026-06');
  });

  it('1月は前年12月にロールオーバーする', () => {
    expect(previousYearMonth('2026-01')).toBe('2025-12');
  });
});

describe('formatPeriodTick (year)', () => {
  it('年粒度はそのまま返す', () => {
    expect(formatPeriodTick('2026', 'year')).toBe('2026');
  });
});

describe('formatPeriodLabel (year)', () => {
  it('年粒度は "年" を付けて返す', () => {
    expect(formatPeriodLabel('2026', 'year')).toBe('2026年');
  });
});

describe('monthDateRange', () => {
  it('31日ある月は月末を31日として返す', () => {
    expect(monthDateRange('2026-07')).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('30日までの月は月末を30日として返す', () => {
    expect(monthDateRange('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('うるう年の2月は29日までとして返す', () => {
    expect(monthDateRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('うるう年でない2月は28日までとして返す', () => {
    expect(monthDateRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});
