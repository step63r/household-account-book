/**
 * ユーザープロフィール（プラン種別）API クライアント。
 * account.ts / consent.ts と同じ理由（auth.ts との循環import回避。auth.ts に置くと
 * api.ts の getAuthToken 経由で循環importになる）で auth.ts には置かない。
 */
import { useQuery } from '@tanstack/react-query';
import type { UserProfileResponse } from '@household/shared';

import { apiFetch } from '@/lib/api';

export async function getProfile(): Promise<UserProfileResponse> {
  return apiFetch<UserProfileResponse>('/users/me');
}

/**
 * プランはログインセッション中に頻繁に変わるものではないため、consent-status
 * （`RequireAuth.tsx`）と同様 `staleTime: Infinity` としてキャッシュし、無駄な
 * 再フェッチを避ける。プラン変更（アップグレード等）はまだ存在しないため、
 * 反映には再ログインまたは画面リロードが必要になる想定。
 */
export function useUserProfile() {
  return useQuery({
    queryKey: ['user-profile'],
    queryFn: getProfile,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
