import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * React Routerはページ遷移時にスクロール位置を自動リセットしないため、
 * パス変更のたびに最上部へ戻す（React Router公式が案内する標準的な回避策）。
 * ブラウザの「戻る/進む」操作ではブラウザ自身のスクロール位置復元が
 * このリセットを上書きしてしまうため、scrollRestorationを手動に切り替えて無効化する。
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
