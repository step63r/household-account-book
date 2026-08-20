import { describe, expect, it } from 'vitest';
import {
  addMonthsToDate,
  clampDateFrom,
  formatDateTimeJst,
  formatDateWithWeekday,
  formatPeriodLabel,
  formatPeriodTick,
  monthDateRange,
  nextYearMonth,
  previousYearMonth,
} from './date';

describe('formatDateTimeJst', () => {
  it('ISO日時文字列を日本時間の yyyy/MM/dd に変換する', () => {
    // UTC 2026-01-01T15:30:00Z は JST では 2026-01-02 00:30
    expect(formatDateTimeJst('2026-01-01T15:30:00.000Z')).toBe('2026/01/02');
  });
});

describe('formatDateWithWeekday', () => {
  it('ISO日付を「M月d日(曜)」形式に変換する', () => {
    expect(formatDateWithWeekday('2026-08-05')).toBe('8月5日(水)');
  });

  it('1桁の月・日をゼロパディングしない', () => {
    expect(formatDateWithWeekday('2026-01-09')).toBe('1月9日(金)');
  });

  it('日曜日を正しく表示する', () => {
    expect(formatDateWithWeekday('2026-08-02')).toBe('8月2日(日)');
  });

  it('土曜日を正しく表示する', () => {
    expect(formatDateWithWeekday('2026-08-01')).toBe('8月1日(土)');
  });
});

describe('previousYearMonth', () => {
  it('通常の月は月を1つ戻す', () => {
    expect(previousYearMonth('2026-07')).toBe('2026-06');
  });

  it('1月は前年12月にロールオーバーする', () => {
    expect(previousYearMonth('2026-01')).toBe('2025-12');
  });
});

describe('nextYearMonth', () => {
  it('通常の月は月を1つ進める', () => {
    expect(nextYearMonth('2026-07')).toBe('2026-08');
  });

  it('12月は翌年1月にロールオーバーする', () => {
    expect(nextYearMonth('2026-12')).toBe('2027-01');
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

describe('addMonthsToDate', () => {
  it('正の月数を加算する', () => {
    expect(addMonthsToDate('2026-04-15', 3)).toBe('2026-07-15');
  });

  it('負の月数で減算する', () => {
    expect(addMonthsToDate('2026-04-15', -3)).toBe('2026-01-15');
  });

  it('年をまたぐ加算をロールオーバーする', () => {
    expect(addMonthsToDate('2026-11-01', 3)).toBe('2027-02-01');
  });

  it('月末日は繰り上がった月の日数に応じて正規化される', () => {
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-03-03');
  });
});

describe('clampDateFrom', () => {
  it('floorDate が未指定なら dateFrom をそのまま返す', () => {
    expect(clampDateFrom('2026-01-01', undefined)).toBe('2026-01-01');
  });

  it('dateFrom が floorDate より古い場合は floorDate にクランプする', () => {
    expect(clampDateFrom('2026-01-01', '2026-05-01')).toBe('2026-05-01');
  });

  it('dateFrom が floorDate 以降ならそのまま返す', () => {
    expect(clampDateFrom('2026-06-01', '2026-05-01')).toBe('2026-06-01');
  });
});
