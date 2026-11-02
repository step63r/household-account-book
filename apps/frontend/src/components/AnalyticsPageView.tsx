import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { initAnalytics, trackPageView } from '@/lib/analytics';

/**
 * React Routerのクライアントサイド遷移はブラウザ上でページ読み込みが発生しないため、
 * GAのページビューをパス変更のたびに明示的に送る。
 * `search` / `hash` は依存に含めず、クエリだけが変わる遷移（個人情報を含みうる）は計測しない。
 */
export function AnalyticsPageView() {
  const { pathname } = useLocation();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
