/**
 * 同意状況（利用規約・プライバシーポリシー）API クライアント。
 * account.ts と同じ理由（auth.ts との循環import回避）で auth.ts には置かない。
 */
import type { ConsentStatus } from '@household/shared';
import { apiFetch } from '@/lib/api';

export async function getConsentStatus(): Promise<ConsentStatus> {
  return apiFetch<ConsentStatus>('/users/me/consent');
}

export async function recordConsent(): Promise<ConsentStatus> {
  return apiFetch<ConsentStatus>('/users/me/consent', { method: 'POST' });
}
