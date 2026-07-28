import type { TrendGranularity } from '@household/shared';

/** ISO日付（yyyy-MM-dd）を表示用の yyyy/MM/dd に変換する。 */
export function formatDate(isoDate: string): string {
  return isoDate.replaceAll('-', '/');
}

/** ISO年月（yyyy-MM）を表示用の yyyy/MM に変換する。 */
export function formatYearMonth(yearMonth: string): string {
  return yearMonth.replaceAll('-', '/');
}

/** ISO週番号（yyyy-Www）から、その週の月曜日を返す。 */
function isoWeekStartDate(period: string): Date {
  const [yearStr, weekStr] = period.split('-W');
  const year = Number(yearStr);
  const week = Number(weekStr);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayNumber = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4.getTime() - jan4DayNumber * 86400000);
  return new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
}

function formatUtcDateFull(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

function formatUtcDateShort(date: Date): string {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

/** グラフのツールチップ等で使う、期間のフル表示ラベル。週は開始日（月曜日）を表示する。 */
export function formatPeriodLabel(period: string, granularity: TrendGranularity): string {
  if (granularity === 'day') return formatDate(period);
  if (granularity === 'month') return formatYearMonth(period);
  return formatUtcDateFull(isoWeekStartDate(period));
}

/** グラフのX軸目盛りで使う、期間の短縮表示ラベル。日・週は m/d、月は yyyy/MM。 */
export function formatPeriodTick(period: string, granularity: TrendGranularity): string {
  if (granularity === 'month') return formatYearMonth(period);
  if (granularity === 'week') return formatUtcDateShort(isoWeekStartDate(period));
  const [, m, d] = period.split('-');
  return `${Number(m)}/${Number(d)}`;
}
