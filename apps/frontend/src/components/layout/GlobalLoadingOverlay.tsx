import { Loader2 } from 'lucide-react';

import { useIsGlobalLoading } from '@/lib/loading-store';

/** 書き込み系リクエスト（取引/予算/費目の作成・更新・削除、退会、ログイン/サインアップ）の
 * 応答待ちの間、全画面に被せるローディング表示。`src/main.tsx` で一度だけマウントする。 */
export function GlobalLoadingOverlay() {
  const isLoading = useIsGlobalLoading();

  if (!isLoading) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
        <span>処理中...</span>
      </div>
    </div>
  );
}
