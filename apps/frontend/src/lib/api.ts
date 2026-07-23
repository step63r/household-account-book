/**
 * 型付き API クライアント。
 *
 * ベース URL の解決・認証トークンの付与・エラー正規化を担う薄い fetch ラッパー。
 * `/categories` は apps/backend に実装済みのため `src/lib/categories.ts` がこの
 * `apiFetch` を使って呼び出す。取引・予算・集計系はバックエンドが未実装（501 スタブ）
 * のため、各ページは引き続き `src/lib/local-store.ts` のローカル（localStorage）実装を
 * 使っている。バックエンドが用意でき次第、対応するエンドポイントをここに追記して
 * `local-store.ts` の呼び出し箇所を `apiFetch` ベースの関数に差し替える想定。
 *
 * エンドポイント形状（apps/backend の実装・infra の CDK ルーティングと確認済み）:
 *   GET    /categories                                    (実装済み)
 *   POST   /categories                                    (実装済み)
 *   PUT    /categories/:id                                (実装済み)
 *   DELETE /categories/:id                                (実装済み)
 *   GET    /transactions?from=YYYY-MM-DD&to=YYYY-MM-DD   (スタブ)
 *   POST   /transactions                                  (スタブ)
 *   PUT    /transactions/:id                               (スタブ)
 *   DELETE /transactions/:id                               (スタブ)
 *   GET    /budgets?yearMonth=YYYY-MM                      (スタブ)
 *   PUT    /budgets  (upsert, body: UpsertBudgetInput)     (スタブ)
 *   GET    /aggregation/trend?granularity=day|week|month&from=...&to=...   (スタブ)
 *   GET    /aggregation/category-pivot?from=...&to=...                     (スタブ)
 *   GET    /aggregation/budget-variance?yearMonth=YYYY-MM                  (スタブ)
 *
 * ログイン/サインアップはこの API を経由しない。CLAUDE.md の設計どおり Cognito User Pool
 * に対して直接（Cognito Hosted UI ではなく `amazon-cognito-identity-js` SDK 経由で）認証する
 * （`src/lib/auth.ts`）。
 *
 * 退会（アカウント論理削除→30日後物理削除）は Cognito だけでは完結せず DynamoDB 側の状態
 * 変更が必要になるため、本来はこの API に `POST /users/me/withdraw` 相当のエンドポイントが
 * 要る。apps/backend にはまだ実装もスタブも存在しない — 今回のスキャフォールディングの
 * スコープ外として積み残し。着手時に backend 側へハンドラを追加すること。
 */
import { getCurrentSession } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * 現在の Cognito セッションから ID トークンを取得する。`src/lib/auth.ts` の
 * `getCurrentSession()` がセッションの有効性確認・期限切れ時のリフレッシュを担う。
 * 未ログイン（または Cognito 環境変数未設定）の場合は `null` を返す。
 */
export async function getAuthToken(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  return session.getIdToken().getJwtToken();
}

export type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  /** true の場合 Authorization ヘッダーを付与しない（login/signup など） */
  skipAuth?: boolean;
};

/**
 * fetch の薄いラッパー。JSON の送受信、認証トークンの付与、エラー正規化を行う。
 */
export async function apiFetch<TResponse>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<TResponse> {
  const { body, skipAuth, headers, ...rest } = options;

  const requestHeaders = new Headers(headers);
  requestHeaders.set('Accept', 'application/json');
  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  if (!skipAuth) {
    const token = await getAuthToken();
    if (token) {
      requestHeaders.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let parsedBody: unknown;
    try {
      parsedBody = await response.json();
    } catch {
      parsedBody = undefined;
    }
    throw new ApiError(response.status, `API request failed: ${response.status}`, parsedBody);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}
