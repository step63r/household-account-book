/**
 * ボタン押下などで発生する書き込み系リクエスト（`apiFetch`のGET以外・Cognito認証）が
 * 進行中かどうかをアプリ全体で共有するための最小限のグローバルストア。
 *
 * `apiFetch`（`src/lib/api.ts`）と Cognito 呼び出し（`src/lib/auth.ts`）の2箇所だけが
 * `beginGlobalLoading` を呼び、`GlobalLoadingOverlay`（`src/components/layout/`）が
 * `useIsGlobalLoading` を購読して全画面オーバーレイの表示を切り替える。
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

let count = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** リクエスト開始を記録し、完了時に呼び出す解放関数を返す（`try/finally`で使う想定）。 */
export function beginGlobalLoading(): () => void {
  count += 1;
  notify();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    count -= 1;
    notify();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return count > 0;
}

/** 表示までの遅延（ms）。極端に速いレスポンスでオーバーレイが一瞬だけ点滅するのを防ぐ。 */
const SHOW_DELAY_MS = 150;

export function useIsGlobalLoading(): boolean {
  const isLoading = useSyncExternalStore(subscribe, getSnapshot);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShouldShow(false);
      return;
    }
    const timer = setTimeout(() => setShouldShow(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  return shouldShow;
}
