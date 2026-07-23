/**
 * 費目（カテゴリ）API クライアント。
 *
 * apps/backend の `/categories` はフルスタックで実装済みの唯一のリソースなので、ここだけ
 * `apiFetch` 経由で実バックエンドに接続する（他のリソースは引き続き `local-store.ts`）。
 * `CategoriesPage.tsx` に加え、費目一覧を参照する `DashboardPage.tsx` / `TransactionsPage.tsx` /
 * `BudgetsPage.tsx` も同じ TanStack Query キー `['categories']` でこのモジュールを使う
 * （取引・予算はローカルの費目 ID を参照するため、費目データソースは 1 箇所に揃える必要がある）。
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
