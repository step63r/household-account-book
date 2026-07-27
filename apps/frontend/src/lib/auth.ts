/**
 * 認証まわり（Amazon Cognito User Pool 連携）。
 *
 * `amazon-cognito-identity-js` を使い、Cognito User Pool に対して SDK 経由で直接
 * 認証する（Cognito Hosted UI は使わない）。バックエンドには `/auth/*` エンドポイントは
 * 存在しない設計（CLAUDE.md 参照）。
 *
 * User Pool ID / アプリクライアント ID は Vite 環境変数から読む
 * （`VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID`。infra の
 * `Household-<stage>-Auth` スタックの CfnOutput `UserPoolId` / `UserPoolClientId`）。
 * まだ AWS にデプロイしていない環境ではこれらは未設定になりうるため、モジュール読み込み時
 * ではなく実際に呼び出された時点で検証し、フォームの送信エラーとして表示できるようにする
 * （画面描画自体をクラッシュさせない）。
 *
 * トークンの保存・更新は `amazon-cognito-identity-js` に任せる: `CognitoUserPool.signUp` /
 * `CognitoUser.authenticateUser` が成功すると、SDK が自身の判断で `window.localStorage`
 * （キーは `<clientId>.<username>...` 形式）にトークンを保存する。以後は
 * `CognitoUserPool.getCurrentUser()` でその最新ユーザーを取得し、`CognitoUser.getSession()`
 * を呼べば期限切れ時はリフレッシュトークンで自動的に再取得してくれる。
 * `getAuthToken()`（`src/lib/api.ts`）はこの仕組みの上で ID トークンを取り出すだけにしている。
 */
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';

import { beginGlobalLoading } from './loading-store';

export type EmailPasswordCredentials = {
  email: string;
  password: string;
};

export type ConfirmSignUpInput = {
  email: string;
  code: string;
};

type AuthenticatedUser = {
  user: CognitoUser;
  session: CognitoUserSession;
};

let cachedUserPool: CognitoUserPool | null = null;

/**
 * Cognito User Pool クライアントを取得する。環境変数が未設定の場合はここで分かりやすい
 * エラーを投げる（呼び出し元は全て async 関数なので、呼び出し側の catch でフォームの
 * エラーメッセージとして表示される）。
 */
function getUserPool(): CognitoUserPool {
  if (cachedUserPool) return cachedUserPool;

  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) {
    throw new Error(
      '認証設定が未構成です（VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_CLIENT_ID を設定してください）',
    );
  }

  cachedUserPool = new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId });
  return cachedUserPool;
}

function getCognitoUser(email: string): CognitoUser {
  return new CognitoUser({ Username: email, Pool: getUserPool() });
}

/** Cognito の例外オブジェクト（`{ code, message, name }` 形式）から表示用メッセージを取り出す。 */
function describeCognitoError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

/** Cognito `signUp`。デフォルトでメール確認コードの入力が必須のため、成功後は `confirmSignUp` を呼ぶ想定。 */
export async function signUpWithEmailPassword({ email, password }: EmailPasswordCredentials): Promise<void> {
  const endLoading = beginGlobalLoading();
  try {
    const pool = getUserPool();
    const attributeList = [new CognitoUserAttribute({ Name: 'email', Value: email })];

    await new Promise<void>((resolve, reject) => {
      pool.signUp(email, password, attributeList, [], (err) => {
        if (err) {
          reject(new Error(describeCognitoError(err, '新規登録に失敗しました')));
          return;
        }
        resolve();
      });
    });
  } finally {
    endLoading();
  }
}

/** サインアップ時にメールで届く確認コードを検証する。成功するとログイン可能になる。 */
export async function confirmSignUp({ email, code }: ConfirmSignUpInput): Promise<void> {
  const endLoading = beginGlobalLoading();
  try {
    const user = getCognitoUser(email);

    await new Promise<void>((resolve, reject) => {
      user.confirmRegistration(code, true, (err) => {
        if (err) {
          reject(new Error(describeCognitoError(err, '確認コードの検証に失敗しました')));
          return;
        }
        resolve();
      });
    });
  } finally {
    endLoading();
  }
}

/** Cognito `authenticateUser`（SRP 認証）。成功すると SDK がセッションを永続化し、`getAuthToken` から参照できるようになる。 */
export async function signInWithEmailPassword({ email, password }: EmailPasswordCredentials): Promise<void> {
  const endLoading = beginGlobalLoading();
  try {
    const user = getCognitoUser(email);
    const authenticationDetails = new AuthenticationDetails({ Username: email, Password: password });

    await new Promise<void>((resolve, reject) => {
      user.authenticateUser(authenticationDetails, {
        onSuccess: () => resolve(),
        onFailure: (err) => reject(new Error(describeCognitoError(err, 'ログインに失敗しました'))),
        newPasswordRequired: () => {
          reject(new Error('初回パスワードの変更が必要です。管理者にお問い合わせください。'));
        },
      });
    });
  } finally {
    endLoading();
  }
}

/** ログアウト。ローカルに保存されたセッション情報を破棄する（Cognito 側の失効はしない `signOut`）。 */
export function signOut(): void {
  try {
    getUserPool().getCurrentUser()?.signOut();
  } catch {
    // 環境変数未設定など、そもそもログインしようがない状態では何もしない
  }
}

/**
 * 現在ログイン中の `CognitoUser` を、有効なセッションを持つ状態で取得する。
 * `updateAttributes`/`verifyAttribute` はセッション読み込み前に呼ぶと失敗するため、
 * 呼び出し前に必ずこれを経由する。未ログイン等の場合は `null`（例外は投げない）。
 */
async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  let pool: CognitoUserPool;
  try {
    pool = getUserPool();
  } catch {
    return null;
  }

  const user = pool.getCurrentUser();
  if (!user) return null;

  return new Promise((resolve) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }
      resolve({ user, session });
    });
  });
}

/**
 * 現在の Cognito セッションを取得する。ログインしていない・環境変数未設定・トークン失効かつ
 * リフレッシュ不可の場合は `null` を返す（例外は投げない）。ルート保護や `getAuthToken` から使う。
 */
export async function getCurrentSession(): Promise<CognitoUserSession | null> {
  const authenticated = await getAuthenticatedUser();
  return authenticated?.session ?? null;
}

/**
 * メールアドレス変更をリクエストする。Cognito 側で新アドレスに確認コードが送られ、
 * `confirmEmailChange` で検証するまで実際の属性値は変わらない
 * （User Pool の `keepOriginal.email` 設定による。infra/lib/auth-stack.ts 参照）。
 */
export async function requestEmailChange(newEmail: string): Promise<void> {
  const endLoading = beginGlobalLoading();
  try {
    const authenticated = await getAuthenticatedUser();
    if (!authenticated) {
      throw new Error('ログインしていません');
    }
    const attribute = new CognitoUserAttribute({ Name: 'email', Value: newEmail });

    await new Promise<void>((resolve, reject) => {
      authenticated.user.updateAttributes([attribute], (err) => {
        if (err) {
          reject(new Error(describeCognitoError(err, 'メールアドレスの変更に失敗しました')));
          return;
        }
        resolve();
      });
    });
  } finally {
    endLoading();
  }
}

/** `requestEmailChange` で新アドレスに送られた確認コードを検証し、メールアドレス変更を完了する。 */
export async function confirmEmailChange(code: string): Promise<void> {
  const endLoading = beginGlobalLoading();
  try {
    const authenticated = await getAuthenticatedUser();
    if (!authenticated) {
      throw new Error('ログインしていません');
    }

    await new Promise<void>((resolve, reject) => {
      authenticated.user.verifyAttribute('email', code, {
        onSuccess: () => resolve(),
        onFailure: (err) => reject(new Error(describeCognitoError(err, '確認コードの検証に失敗しました'))),
      });
    });
  } finally {
    endLoading();
  }
}
