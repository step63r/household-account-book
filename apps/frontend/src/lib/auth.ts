/**
 * 認証まわりのスタブ。
 *
 * Amazon Cognito User Pool 連携（メール/パスワード）は未実装。ここでは呼び出し口（シーム）
 * だけを定義し、フォーム側は既にこのインターフェースに対して実装してある。
 *
 * TODO(backend/auth): 実装時は `amazon-cognito-identity-js` または AWS Amplify Auth を使い、
 * - signInWithEmailPassword: CognitoUser.authenticateUser 相当
 * - signUpWithEmailPassword: CognitoUserPool.signUp 相当（要メール確認フローの追加検討）
 * - requestAccountWithdrawal: バックエンドの POST /users/me/withdraw 呼び出し
 * に置き換える。トークン取得は `src/lib/api.ts` の `getAuthToken` と連携させる
 * （例: サインイン成功時に Cognito セッションをローカルに保持し、getAuthToken から読む）。
 *
 * 現状は未確定のバックエンド API に対してサイレントに繋ぎ込まず、フォームのバリデーション/UX
 * だけを確認できるダミー実装にしている。
 */

export type EmailPasswordCredentials = {
  email: string;
  password: string;
};

export async function signInWithEmailPassword(_credentials: EmailPasswordCredentials): Promise<void> {
  throw new Error(
    'Cognito 連携は未実装です（TODO: signInWithEmailPassword を実装してください）',
  );
}

export async function signUpWithEmailPassword(_credentials: EmailPasswordCredentials): Promise<void> {
  throw new Error(
    'Cognito 連携は未実装です（TODO: signUpWithEmailPassword を実装してください）',
  );
}

/** 退会申請。CLAUDE.md 方針: 論理削除→30日程度の猶予後にバッチで物理削除。 */
export async function requestAccountWithdrawal(): Promise<void> {
  throw new Error(
    '退会APIは未実装です（TODO: POST /users/me/withdraw 相当のエンドポイントに接続してください）',
  );
}
