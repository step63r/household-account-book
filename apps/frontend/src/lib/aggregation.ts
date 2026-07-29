/**
 * 集計 API クライアント。`apiFetch` 経由で `apps/backend` の `/aggregation/*` に接続する
 * （`src/lib/budgets.ts` と同じ薄いラッパーの形）。
 *
 * 日次/週次/月次/年次推移・費目別ピボット・予実差はいずれもLambda側でインメモリ集計され、
 * フロントは結果をそのまま描画する（CLAUDE.md の方針どおり）。
 */
import type { BudgetVarianceRow, CategoryPivotRow, TrendGranularity, TrendPoint } from '@household/shared';

import { apiFetch } from '@/lib/api';

/** GET /aggregation/trend?granularity=day|week|month|year&from=YYYY-MM-DD&to=YYYY-MM-DD
 * transfer を除外した収支推移。from省略時は全履歴が対象。 */
export function getTrend(params: {
  granularity: TrendGranularity;
  from?: string;
  to: string;
}): Promise<TrendPoint[]> {
  const query = new URLSearchParams({ granularity: params.granularity, to: params.to });
  if (params.from) query.set('from', params.from);
  return apiFetch<TrendPoint[]>(`/aggregation/trend?${query.toString()}`);
}

/** GET /aggregation/category-pivot?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week|month|year
 * 費目別ピボット（expenseのみ）。granularity省略時はバックエンド側で 'month' 扱い。 */
export function getCategoryPivot(params: {
  from: string;
  to: string;
  granularity?: TrendGranularity;
}): Promise<CategoryPivotRow[]> {
  const query = new URLSearchParams({ from: params.from, to: params.to });
  if (params.granularity) query.set('granularity', params.granularity);
  return apiFetch<CategoryPivotRow[]>(`/aggregation/category-pivot?${query.toString()}`);
}

/** GET /aggregation/budget-variance?yearMonth=YYYY-MM
 * 予実差（指定月・費目別、expenseのみ）。 */
export function getBudgetVariance(yearMonth: string): Promise<BudgetVarianceRow[]> {
  return apiFetch<BudgetVarianceRow[]>(`/aggregation/budget-variance?yearMonth=${encodeURIComponent(yearMonth)}`);
}
