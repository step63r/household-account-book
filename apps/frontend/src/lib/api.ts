/**
 * 型付き API クライアント。
 *
 * ベース URL の解決・認証トークンの付与・エラー正規化を担う薄い fetch ラッパー。
 * 各リソースは `src/lib/categories.ts` / `transactions.ts` / `budgets.ts` / `account.ts`
 * がこの `apiFetch` を使って apps/backend を呼び出す（集計エンドポイントはまだフロントから
 * 呼んでいない — `DashboardPage.tsx` は引き続き `src/lib/aggregate.ts` でクライアント側集計）。
 *
 * エンドポイント形状（apps/backend の実装・infra の CDK ルーティングと確認済み、すべて実装済み）:
 *   GET    /categories                                    src/lib/categories.ts
 *   POST   /categories
 *   PUT    /categories/:id
 *   DELETE /categories/:id
 *   GET    /transactions?from=YYYY-MM-DD&to=YYYY-MM-DD   src/lib/transactions.ts
 *   POST   /transactions
 *   PUT    /transactions/:id
 *   DELETE /transactions/:id
 *   GET    /budgets?yearMonth=YYYY-MM                      src/lib/budgets.ts
 *   PUT    /budgets  (upsert, body: UpsertBudgetInput)
 *   GET    /aggregation/trend?granularity=day|week|month&from=...&to=...   (未使用)
 *   GET    /aggregation/category-pivot?from=...&to=...                     (未使用)
 *   GET    /aggregation/budget-variance?yearMonth=YYYY-MM                  (未使用)
 *   POST   /users/me/withdraw                               src/lib/account.ts
 *   GET    /users/me/consent                                src/lib/consent.ts
 *   POST   /users/me/consent
 *
 * ログイン/サインアップはこの API を経由しない。CLAUDE.md の設計どおり Cognito User Pool
 * に対して直接（Cognito Hosted UI ではなく `amazon-cognito-identity-js` SDK 経由で）認証する
 * （`src/lib/auth.ts`）。退会だけは DynamoDB 側の状態変更が必要なため例外的にこの API を叩く
 * （`src/lib/account.ts`。`auth.ts` に置くと `getAuthToken` がその `auth.ts` を参照する関係で
 * 循環importになるため分離している）。
 */
import { getCurrentSession } from './auth';
import { beginGlobalLoading } from './loading-store';

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

  // GET（一覧取得など）はページ表示のたびに走るため、書き込み系リクエストのみを
  // グローバルローディングオーバーレイの対象にする。
  const method = (rest.method ?? 'GET').toString().toUpperCase();
  const endLoading = method === 'GET' ? null : beginGlobalLoading();

  try {
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
  } finally {
    endLoading?.();
  }
}
