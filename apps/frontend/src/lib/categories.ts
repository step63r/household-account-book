/**
 * 費目（カテゴリ）API クライアント。`apiFetch` 経由で実バックエンドに接続する
 * （`src/lib/transactions.ts` / `src/lib/budgets.ts` と同じ薄いラッパーの形）。
 * `CategoriesPage.tsx` に加え、費目一覧を参照する `DashboardPage.tsx` / `TransactionsPage.tsx` /
 * `BudgetsPage.tsx` も同じ TanStack Query キー `['categories']` でこのモジュールを使う
 * （取引・予算は費目 ID を参照するため、費目データソースは 1 箇所に揃える必要がある）。
 */
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@household/shared';

import { apiFetch } from '@/lib/api';

export function getCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/categories');
}

export function createCategory(input: CreateCategoryInput): Promise<Category> {
  return apiFetch<Category>('/categories', { method: 'POST', body: input });
}

export function updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
  return apiFetch<Category>(`/categories/${id}`, { method: 'PUT', body: input });
}

export function deleteCategory(id: string): Promise<void> {
  return apiFetch<void>(`/categories/${id}`, { method: 'DELETE' });
}
