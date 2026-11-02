/**
 * Google Analytics 4 (gtag.js) の初期化とページビュー送信。
 *
 * 家計簿アプリのため、URLに含まれうる個人情報・秘匿情報（パスワードリセットの
 * `?email=...&code=...`、招待リンクの `?token=...`、ログイン後リダイレクト先 `?redirect=...` など）が
 * GAに送られないよう、ページビューは常にクエリ・ハッシュを除いた「origin + pathname」のみを送る。
 */

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

// 開発中のアクセスで本番の統計を汚さないよう、本番ビルドかつ測定IDが設定されているときだけ有効にする。
const enabled = import.meta.env.PROD && !!MEASUREMENT_ID;

let initialized = false;

// gtag.jsは `arguments` オブジェクトそのものを dataLayer に積む実装を前提にしている
// （スプレッド引数の配列では解釈されない）ため、アロー関数ではなく function 宣言を使う。
function gtag(..._args: unknown[]) {
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer?.push(arguments);
}

export function initAnalytics(): void {
  if (!enabled || initialized) return;
  initialized = true;

  window.dataLayer = window.dataLayer ?? [];
  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, {
    // SPAのためルート遷移ごとに trackPageView で手動送信する（自動送信だと生URLが送られる）。
    send_page_view: false,
    // 広告向けの機能（Googleシグナル・広告パーソナライズ）は使わない。プライバシーポリシーの
    // 「広告配信・行動追跡を目的としない」という記載を保つため。
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);
}

export function trackPageView(pathname: string): void {
  if (!enabled) return;
  gtag('event', 'page_view', {
    page_location: `${window.location.origin}${pathname}`,
    page_path: pathname,
  });
}
