/**
 * 集計 API クライアント。`apiFetch` 経由で `apps/backend` の `/aggregation/*` に接続する
 * （`src/lib/budgets.ts` と同じ薄いラッパーの形）。
 *
 * 日次/週次/月次/年次推移・費目別ピボット・予実差はいずれもLambda側でインメモリ集計され、
 * フロントは結果をそのまま描画する（CLAUDE.md の方針どおり）。
 */
import type {
  BudgetVarianceRow,
  CategoryPivotRow,
  TrendGranularity,
  TrendPoint,
} from '@household/shared';

import { apiFetch } from '@/lib/api';

/** GET /aggregation/trend?granularity=day|week|month|year&from=YYYY-MM-DD&to=YYYY-MM-DD&excludeFixed=true
 * transfer を除外した収支推移。from省略時は全履歴が対象。excludeFixed指定時は固定費の費目を
 * expenseの合計から除外する（ダッシュボードの収支推移グラフ専用。KPIタイル・資産形成推移では使わない）。 */
export function getTrend(params: {
  granularity: TrendGranularity;
  from?: string;
  to: string;
  excludeFixed?: boolean;
}): Promise<TrendPoint[]> {
  const query = new URLSearchParams({ granularity: params.granularity, to: params.to });
  if (params.from) query.set('from', params.from);
  if (params.excludeFixed) query.set('excludeFixed', 'true');
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
  return apiFetch<BudgetVarianceRow[]>(
    `/aggregation/budget-variance?yearMonth=${encodeURIComponent(yearMonth)}`,
  );
}

/** GET /aggregation/memo-suggestions?from=YYYY-MM-DD&to=YYYY-MM-DD&categoryId=<id>
 * 過去の摘要候補（直近使用日→使用回数順、最大20件）。from/to省略時は全履歴が対象。
 * categoryId指定時は、その費目の取引のみに絞り込む。 */
export function getMemoSuggestions(
  params: { from?: string; to?: string; categoryId?: string } = {},
): Promise<string[]> {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.categoryId) query.set('categoryId', params.categoryId);
  const qs = query.toString();
  return apiFetch<string[]>(`/aggregation/memo-suggestions${qs ? `?${qs}` : ''}`);
}
