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
  if (granularity === 'year') return `${period}年`;
  return formatUtcDateFull(isoWeekStartDate(period));
}

/** グラフのX軸目盛りで使う、期間の短縮表示ラベル。日・週は m/d、月は yyyy/MM、年はそのまま。 */
export function formatPeriodTick(period: string, granularity: TrendGranularity): string {
  if (granularity === 'month') return formatYearMonth(period);
  if (granularity === 'week') return formatUtcDateShort(isoWeekStartDate(period));
  if (granularity === 'year') return period;
  const [, m, d] = period.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/** 日本時間の本日日付（YYYY-MM-DD）。toISOString()はUTC基準になるため使わない
 * （深夜0〜9時のUTC日付が前日にずれる）。 */
export function todayJst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

/** 日本時間の当月（YYYY-MM）。 */
export function currentYearMonthJst(): string {
  return todayJst().slice(0, 7);
}

/** 日本時間の当年（YYYY）。 */
export function currentYearJst(): string {
  return todayJst().slice(0, 4);
}

/** 指定した年月（YYYY-MM）の前月（YYYY-MM）を返す。1月なら前年12月にロールオーバーする。 */
export function previousYearMonth(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** 指定した年月（YYYY-MM）の初日・末日（YYYY-MM-DD）を返す。集計APIの範囲指定に使う。 */
export function monthDateRange(yearMonth: string): { from: string; to: string } {
  const [yearStr, monthStr] = yearMonth.split('-');
  const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(lastDay).padStart(2, '0')}` };
}

/** 指定した年（YYYY）の1/1・12/31（YYYY-MM-DD）を返す。集計APIの範囲指定に使う。 */
export function yearDateRange(year: string): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** ISO日付（yyyy-MM-dd）に指定した月数を加算する（負数で減算）。日付ピッカーの範囲制約計算に使う。 */
export function addMonthsToDate(dateStr: string, months: number): string {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}

/** 2つのISO日付文字列（yyyy-MM-dd）のうち遅い方を返す。片方が undefined ならもう片方をそのまま返す。
 * 取引一覧の dateFrom の下限（範囲幅の制約とプラン制限floorの両方を満たす値）を求めるのに使う。 */
export function laterDateString(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** dateFrom が floorDate より古い場合、floorDate にクランプする（無料プランの参照可能期間制限用）。
 * floorDate が undefined（有料プラン=無制限）の場合は dateFrom をそのまま返す。 */
export function clampDateFrom(dateFrom: string, floorDate: string | undefined): string {
  if (!floorDate) return dateFrom;
  return dateFrom < floorDate ? floorDate : dateFrom;
}
