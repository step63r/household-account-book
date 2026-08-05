/**
 * 認証まわり（Amazon Cognito User Pool 連携）。
 *
 * AWS公式の `aws-amplify`（Authカテゴリ）を使い、Cognito User Poolに対して直接
 * 認証する（Cognito Hosted UIは使わない）。バックエンドには `/auth/*` エンドポイントは
 * 存在しない設計（CLAUDE.md参照）。
 *
 * 以前は `amazon-cognito-identity-js` を直接使っていたが、CognitoのメールMFA（`EMAIL_OTP`
 * チャレンジ）にそのライブラリが対応していない（型・実行時ロジックともに存在せず、飛んで
 * くると誤動作する）ため `aws-amplify` に移行した。
 *
 * User Pool ID / アプリクライアント ID は Vite 環境変数から読む
 * （`VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID`。infra の
 * `Household-<stage>-Auth` スタックの CfnOutput `UserPoolId` / `UserPoolClientId`）。
 * まだ AWS にデプロイしていない環境ではこれらは未設定になりうるため、モジュール読み込み時
 * ではなく実際に呼び出された時点で検証し、フォームの送信エラーとして表示できるようにする
 * （画面描画自体をクラッシュさせない）。
 *
 * トークンの保存・更新は `aws-amplify` に任せる: `Amplify.configure` 後に `signIn` 等が
 * 成功すると、SDK が自身の判断で `window.localStorage` にトークンを保存する。以後は
 * `fetchAuthSession()` を呼べば期限切れ時はリフレッシュトークンで自動的に再取得してくれる。
 */
import { Amplify } from 'aws-amplify';
import {
  confirmResetPassword,
  confirmSignIn,
  confirmSignUp as amplifyConfirmSignUp,
  confirmUserAttribute,
  fetchAuthSession,
  fetchMFAPreference,
  resetPassword,
  setUpTOTP,
  signIn,
  signOut as amplifySignOut,
  signUp,
  updateMFAPreference,
  updatePassword,
  updateUserAttributes,
  verifyTOTPSetup,
  type SignInOutput,
} from 'aws-amplify/auth';

export type EmailPasswordCredentials = {
  email: string;
  password: string;
};

export type ConfirmSignUpInput = {
  email: string;
  code: string;
};

let configured = false;

/**
 * Amplifyの設定（`Amplify.configure`）を初回呼び出し時にのみ行う。環境変数が未設定の場合は
 * ここで分かりやすいエラーを投げる（呼び出し元は全て async 関数なので、呼び出し側の catch で
 * フォームのエラーメッセージとして表示される）。
 */
function ensureAmplifyConfigured(): void {
  if (configured) return;

  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  if (!userPoolId || !userPoolClientId) {
    throw new Error(
      '認証設定が未構成です（VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_CLIENT_ID を設定してください）',
    );
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: { email: true },
      },
    },
  });
  configured = true;
}

/** Amplifyの例外オブジェクト（`AuthError`、`message`を持つ）から表示用メッセージを取り出す。 */
function describeCognitoError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Cognito `signUp`。デフォルトでメール確認コードの入力が必須のため、成功後は `confirmSignUp` を呼ぶ想定。 */
export async function signUpWithEmailPassword({
  email,
  password,
}: EmailPasswordCredentials): Promise<void> {
  ensureAmplifyConfigured();
  try {
    await signUp({ username: email, password, options: { userAttributes: { email } } });
  } catch (err) {
    throw new Error(describeCognitoError(err, '新規登録に失敗しました'));
  }
}

/** サインアップ時にメールで届く確認コードを検証する。成功するとログイン可能になる。 */
export async function confirmSignUp({ email, code }: ConfirmSignUpInput): Promise<void> {
  ensureAmplifyConfigured();
  try {
    await amplifyConfirmSignUp({ username: email, confirmationCode: code });
  } catch (err) {
    throw new Error(describeCognitoError(err, '確認コードの検証に失敗しました'));
  }
}

export type SignInResult =
  | { status: 'success' }
  | {
      status: 'mfaCodeRequired';
      method: 'TOTP' | 'EMAIL';
      confirmCode: (code: string) => Promise<SignInResult>;
    }
  | {
      status: 'mfaSelectionRequired';
      options: ('TOTP' | 'EMAIL')[];
      selectMethod: (method: 'TOTP' | 'EMAIL') => Promise<SignInResult>;
    };

/** `signIn`/`confirmSignIn` の `nextStep` を、このアプリで扱う `SignInResult` に変換する。 */
function interpretSignInResult(result: SignInOutput): SignInResult {
  const { nextStep } = result;
  switch (nextStep.signInStep) {
    case 'DONE':
      return { status: 'success' };
    case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
      return {
        status: 'mfaCodeRequired',
        method: 'TOTP',
        confirmCode: (code) => confirmMfaChallenge(code, '認証コードが正しくありません'),
      };
    case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
      return {
        status: 'mfaCodeRequired',
        method: 'EMAIL',
        confirmCode: (code) => confirmMfaChallenge(code, '認証コードが正しくありません'),
      };
    case 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION': {
      // 設計上は常にTOTP/メールのどちらか一方のみを有効化するため通常は発生しないが、
      // Cognito側の状態が想定外（例: 手動操作で両方有効）でも落ちないよう防御的に扱う。
      const options = (nextStep.allowedMFATypes ?? []).filter(
        (t): t is 'TOTP' | 'EMAIL' => t === 'TOTP' || t === 'EMAIL',
      );
      return {
        status: 'mfaSelectionRequired',
        options,
        selectMethod: (method) => confirmMfaChallenge(method, 'MFA方式の選択に失敗しました'),
      };
    }
    default:
      // 新規パスワード必須・サインアップ未確認など、現在のUIフローでは到達しない想定の状態。
      throw new Error('ログインに失敗しました（想定外の状態です）');
  }
}

async function confirmMfaChallenge(
  challengeResponse: string,
  errorFallback: string,
): Promise<SignInResult> {
  let result: SignInOutput;
  try {
    result = await confirmSignIn({ challengeResponse });
  } catch (err) {
    throw new Error(describeCognitoError(err, errorFallback));
  }
  return interpretSignInResult(result);
}

/**
 * Cognito `signIn`（SRP認証）。成功するとSDKがセッションを永続化し、`getAuthToken`から参照
 * できるようになる。TOTP/メールMFAが有効なユーザーの場合は`mfaCodeRequired`を返し、
 * 呼び出し元に6桁コードの入力を求めさせる。
 */
export async function signInWithEmailPassword({
  email,
  password,
}: EmailPasswordCredentials): Promise<SignInResult> {
  ensureAmplifyConfigured();
  try {
    const result = await signIn({ username: email, password });
    return interpretSignInResult(result);
  } catch (err) {
    throw new Error(describeCognitoError(err, 'ログインに失敗しました'));
  }
}

/**
 * パスワード再設定（忘れた場合）の受付。Cognito がメールで確認コードを送信する
 * （実際にはユーザー向けにはリンク形式に書き換える CustomMessage Lambda トリガーを別途設定する想定）。
 */
export async function forgotPassword(email: string): Promise<void> {
  ensureAmplifyConfigured();
  try {
    await resetPassword({ username: email });
  } catch (err) {
    throw new Error(describeCognitoError(err, 'パスワード再設定の受付に失敗しました'));
  }
}

export type ConfirmForgotPasswordInput = {
  email: string;
  code: string;
  newPassword: string;
};

/** `forgotPassword` で送られた確認コードを検証し、新しいパスワードを設定する。旧パスワードは不要。 */
export async function confirmForgotPassword({
  email,
  code,
  newPassword,
}: ConfirmForgotPasswordInput): Promise<void> {
  ensureAmplifyConfigured();
  try {
    await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
  } catch (err) {
    throw new Error(describeCognitoError(err, 'パスワードの再設定に失敗しました'));
  }
}

/** ログアウト。ローカルに保存されたセッション情報を破棄する。 */
export async function signOut(): Promise<void> {
  try {
    ensureAmplifyConfigured();
    await amplifySignOut();
  } catch {
    // 環境変数未設定など、そもそもログインしようがない状態や、サインアウト自体が失敗した場合も
    // 何もしない（呼び出し元は必ずログイン画面へ遷移するだけなので、失敗を伝える意味が薄い）
  }
}

export type AppSession = { idToken: string; email: string | null } | null;

/**
 * 現在の認証セッションを取得する。ログインしていない・環境変数未設定・トークン失効かつ
 * リフレッシュ不可の場合は `null` を返す（例外は投げない）。ルート保護や `getAuthToken` から使う。
 */
export async function getCurrentSession(): Promise<AppSession> {
  try {
    ensureAmplifyConfigured();
  } catch {
    return null;
  }

  try {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken;
    if (!idToken) return null;
    const emailClaim = idToken.payload.email;
    return {
      idToken: idToken.toString(),
      email: typeof emailClaim === 'string' ? emailClaim : null,
    };
  } catch {
    return null;
  }
}

/**
 * メールアドレス変更をリクエストする。Cognito 側で新アドレスに確認コードが送られ、
 * `confirmEmailChange` で検証するまで実際の属性値は変わらない
 * （User Pool の `keepOriginal.email` 設定による。infra/lib/auth-stack.ts 参照）。
 */
export async function requestEmailChange(newEmail: string): Promise<void> {
  ensureAmplifyConfigured();
  try {
    await updateUserAttributes({ userAttributes: { email: newEmail } });
  } catch (err) {
    throw new Error(describeCognitoError(err, 'メールアドレスの変更に失敗しました'));
  }
}

/** `requestEmailChange` で新アドレスに送られた確認コードを検証し、メールアドレス変更を完了する。 */
export async function confirmEmailChange(code: string): Promise<void> {
  ensureAmplifyConfigured();
  try {
    await confirmUserAttribute({ userAttributeKey: 'email', confirmationCode: code });
  } catch (err) {
    throw new Error(describeCognitoError(err, '確認コードの検証に失敗しました'));
  }
}

/** ログイン中ユーザーのパスワードを変更する。1ステップで完結し、成功後も既存セッションは失効しない。 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  ensureAmplifyConfigured();
  try {
    await updatePassword({ oldPassword, newPassword });
  } catch (err) {
    throw new Error(describeCognitoError(err, 'パスワードの変更に失敗しました'));
  }
}

export type MfaMethod = 'NONE' | 'TOTP' | 'EMAIL';

/** ログイン中ユーザーが現在有効化しているMFA方式を返す。 */
export async function getMfaStatus(): Promise<MfaMethod> {
  ensureAmplifyConfigured();
  const { enabled, preferred } = await fetchMFAPreference();
  const active = preferred ?? enabled?.[0];
  return active === 'TOTP' || active === 'EMAIL' ? active : 'NONE';
}

/** TOTP登録を開始し、認証アプリでQRコード（or 手入力）に使うURI・シークレットを発行する。 */
export async function startTotpEnrollment(email: string): Promise<{ uri: string; secret: string }> {
  ensureAmplifyConfigured();
  const details = await setUpTOTP();
  return {
    uri: details.getSetupUri('家計簿アプリ', email).toString(),
    secret: details.sharedSecret,
  };
}

/** `startTotpEnrollment` で発行したシークレットに対応する6桁コードを検証し、TOTPをMFAとして有効化する。 */
export async function confirmTotpEnrollment(code: string): Promise<void> {
  ensureAmplifyConfigured();
  try {
    await verifyTOTPSetup({ code });
  } catch (err) {
    throw new Error(describeCognitoError(err, '認証コードの検証に失敗しました'));
  }
  try {
    await updateMFAPreference({ totp: 'PREFERRED', email: 'DISABLED', sms: 'DISABLED' });
  } catch (err) {
    throw new Error(describeCognitoError(err, 'MFAの有効化に失敗しました'));
  }
}

/**
 * メールMFAを有効化する。メールアドレスは既にサインアップ時に検証済みの属性のため、
 * TOTPと異なり追加のコード確認ステップは不要（コード確認が必要になるのは次回ログイン時）。
 */
export async function enableEmailMfa(): Promise<void> {
  ensureAmplifyConfigured();
  try {
    await updateMFAPreference({ email: 'PREFERRED', totp: 'DISABLED', sms: 'DISABLED' });
  } catch (err) {
    throw new Error(describeCognitoError(err, 'MFAの有効化に失敗しました'));
  }
}

/** MFAを無効化する（TOTP・メールいずれも）。 */
export async function disableMfa(): Promise<void> {
  ensureAmplifyConfigured();
  try {
    await updateMFAPreference({ totp: 'DISABLED', email: 'DISABLED', sms: 'DISABLED' });
  } catch (err) {
    throw new Error(describeCognitoError(err, 'MFAの無効化に失敗しました'));
  }
}
