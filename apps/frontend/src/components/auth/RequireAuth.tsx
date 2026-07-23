import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { getCurrentSession } from '@/lib/auth';

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
 */
export function RequireAuth() {
  const location = useLocation();
  const [status, setStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');

  useEffect(() => {
    let cancelled = false;
    getCurrentSession()
      .then((session) => {
        if (!cancelled) setStatus(session ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (!cancelled) setStatus('unauthenticated');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'checking') {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        読み込み中...
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
