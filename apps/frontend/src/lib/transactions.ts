/**
 * 取引 API クライアント。`apiFetch` 経由で `apps/backend` の `/transactions` に接続する
 * （`src/lib/categories.ts` と同じ薄いラッパーの形）。
 */
import type { CreateTransactionInput, Transaction, UpdateTransactionInput } from '@household/shared';

import { apiFetch } from '@/lib/api';

export type TransactionDateRange = {
  from?: string;
  to?: string;
};

export function getTransactions(range?: TransactionDateRange): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (range?.from) params.set('from', range.from);
  if (range?.to) params.set('to', range.to);
  const query = params.toString();
  return apiFetch<Transaction[]>(`/transactions${query ? `?${query}` : ''}`);
}

export function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  return apiFetch<Transaction>('/transactions', { method: 'POST', body: input });
}

export function updateTransaction(id: string, input: UpdateTransactionInput): Promise<Transaction> {
  return apiFetch<Transaction>(`/transactions/${id}`, { method: 'PUT', body: input });
}

export function deleteTransaction(id: string): Promise<void> {
  return apiFetch<void>(`/transactions/${id}`, { method: 'DELETE' });
}
