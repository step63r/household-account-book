/**
 * サブスクリプションAPI クライアント。`apiFetch` 経由で実バックエンドに接続する
 * （`src/lib/categories.ts` と同じ薄いラッパーの形）。
 */
import type {
  CreateSubscriptionInput,
  Subscription,
  UpdateSubscriptionInput,
} from '@household/shared';

import { apiFetch } from '@/lib/api';

export function getSubscriptions(): Promise<Subscription[]> {
  return apiFetch<Subscription[]>('/subscriptions');
}

export function createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
  return apiFetch<Subscription>('/subscriptions', { method: 'POST', body: input });
}

export function updateSubscription(
  id: string,
  input: UpdateSubscriptionInput,
): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}`, { method: 'PUT', body: input });
}

export function deleteSubscription(id: string): Promise<void> {
  return apiFetch<void>(`/subscriptions/${id}`, { method: 'DELETE' });
}
