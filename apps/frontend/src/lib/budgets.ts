/**
 * 予算 API クライアント。`apiFetch` 経由で `apps/backend` の `/budgets` に接続する
 * （`src/lib/categories.ts` と同じ薄いラッパーの形）。
 *
 * `GET /budgets` は `yearMonth` が必須クエリパラメータ（バックエンドの
 * `yearMonthSchema` がバリデーションする）。
 */
import type { Budget, UpsertBudgetInput } from '@household/shared';

import { apiFetch } from '@/lib/api';

export function getBudgets(yearMonth: string): Promise<Budget[]> {
  return apiFetch<Budget[]>(`/budgets?yearMonth=${encodeURIComponent(yearMonth)}`);
}

export function upsertBudget(input: UpsertBudgetInput): Promise<Budget> {
  return apiFetch<Budget>('/budgets', { method: 'PUT', body: input });
}
