import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { getCurrentSession } from '@/lib/auth';
import { getConsentStatus } from '@/lib/consent';

/**
 * ダッシュボード/取引/予算/費目/設定などの認証必須ルートを保護するレイアウトルート。
 *
 * `App.tsx` でこのコンポーネントを親ルートの element にし、保護したいページをその子ルート
 * として並べる。マウント時に一度だけ Cognito のセッション有無を確認し、未ログイン
 * （または `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID` 未設定でそもそも
 * ログインしようがない場合を含む）なら `/login` へリダイレクトする。
 *
 * 依存配列を空にしているのは、兄弟ルート間のナビゲーション（例: /dashboard → /transactions）
 * のたびにこのレイアウトルートが再マウントされてローディング表示がちらつくのを防ぐため。
 *
 * セッション確認後、利用規約・プライバシーポリシーの同意状況も確認し、`mustAgree` なら
 * `/consent` へリダイレクトする。`staleTime: Infinity` としているのは、このコンポーネント
 * 自体が兄弟ルート間遷移で再マウントされない設計のため、自動再フェッチに頼ると
 * `ConsentPage` で同意した直後も古い `mustAgree: true` を返し続けてしまうことを避けるため
 * （`ConsentPage` が `queryClient.setQueryData` で直接キャッシュを更新する方式に統一する）。
 */
export function RequireAuth() {
  const location = useLocation();
  const [sessionStatus, setSessionStatus] = useState<
    'checking' | 'authenticated' | 'unauthenticated'
  >('checking');

  useEffect(() => {
    let cancelled = false;
    getCurrentSession()
      .then((session) => {
        if (!cancelled) setSessionStatus(session ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (!cancelled) setSessionStatus('unauthenticated');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const consentQuery = useQuery({
    queryKey: ['consent-status'],
    queryFn: getConsentStatus,
    enabled: sessionStatus === 'authenticated',
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (
    sessionStatus === 'checking' ||
    (sessionStatus === 'authenticated' && consentQuery.isLoading)
  ) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        読み込み中...
      </div>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // 同意状況の取得に失敗した場合（一時的なAPI障害等）はロックアウトせずアプリを使わせる
  const mustAgree = consentQuery.data?.mustAgree ?? false;
  // /consent 自身では再度リダイレクトしない（無限リダイレクトの防止。念のための二重の安全策）
  if (mustAgree && location.pathname !== '/consent') {
    return <Navigate to="/consent" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
