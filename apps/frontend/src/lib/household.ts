/**
 * 世帯共有機能 API クライアント。
 *
 * `account.ts` / `profile.ts` と同じ理由（`auth.ts` との循環import回避。`auth.ts` に置くと
 * `api.ts` の `getAuthToken` がその `auth.ts` を参照する関係で循環importになる）で
 * `auth.ts` には置かず、独立モジュールとして `apiFetch` をラップする。
 *
 * `previewInvite` のみ未ログイン状態（`JoinHouseholdPage.tsx`）から呼ばれるため
 * `skipAuth: true` を指定する。
 */
import { useQuery } from '@tanstack/react-query';
import type { HouseholdSummary, InvitePreview } from '@household/shared';

import { apiFetch } from '@/lib/api';

export async function getMyHousehold(): Promise<HouseholdSummary> {
  return apiFetch<HouseholdSummary>('/households/me');
}

/**
 * 世帯情報はメンバー構成の変更（招待の承諾・脱退）が起きたタイミングで呼び出し元が
 * 明示的に `['household']` を invalidate する運用のため、`staleTime` はデフォルトのまま
 * （`src/lib/query-client.ts` の `staleTime: 30_000`）でよい。
 */
export function useHousehold() {
  return useQuery({
    queryKey: ['household'],
    queryFn: getMyHousehold,
  });
}

export async function updateHouseholdName(name: string): Promise<HouseholdSummary> {
  return apiFetch<HouseholdSummary>('/households/me', { method: 'PATCH', body: { name } });
}

export async function createInvite(email: string): Promise<{
  invitedEmail: string;
  expiresAt: string;
}> {
  return apiFetch('/households/me/invites', { method: 'POST', body: { email } });
}

/** 招待リンクのプレビュー。未ログインでも参照できる必要があるため `skipAuth: true`。 */
export async function previewInvite(token: string): Promise<InvitePreview> {
  return apiFetch<InvitePreview>(`/invites/${token}`, { method: 'GET', skipAuth: true });
}

export async function acceptInvite(token: string): Promise<HouseholdSummary> {
  return apiFetch<HouseholdSummary>(`/invites/${token}/accept`, { method: 'POST' });
}

export async function leaveHousehold(): Promise<HouseholdSummary> {
  return apiFetch<HouseholdSummary>('/households/me/leave', { method: 'POST' });
}
