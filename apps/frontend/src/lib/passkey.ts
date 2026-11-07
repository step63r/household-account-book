/**
 * パスキー（WebAuthn）認証。Amazon Cognito の `USER_AUTH`（選択型サインイン）フローを使う。
 *
 * `amazon-cognito-identity-js` は `USER_AUTH` / WebAuthn に非対応のため、パスキー関連の
 * API 呼び出しだけ `@aws-sdk/client-cognito-identity-provider` で行う。ここで得たトークンは
 * `establishSession`（`src/lib/auth.ts`）で SRP ログインと同じ形式に保存するので、以降の
 * セッション参照（`getCurrentSession` / `getAuthToken` / `RequireAuth`）は既存のまま動く。
 *
 * `auth.ts` からこのファイルを import しない（循環 import の回避。`account.ts` と同じ配慮）。
 *
 * パスキーは RP ID（`infra/lib/auth-stack.ts` で `frontendBaseUrl` のホスト名に設定）に
 * 紐付くため、そのドメイン以外（localhost や amplifyapp.com）では登録・利用ともに失敗する。
 *
 * WebAuthn の JSON ⇔ ArrayBuffer 変換はブラウザ標準の `parse*OptionsFromJSON` / `toJSON` に任せ、
 * 追加ライブラリは入れない（対応ブラウザはモダンブラウザのみという方針）。
 */
import {
  CognitoIdentityProviderClient,
  CompleteWebAuthnRegistrationCommand,
  DeleteWebAuthnCredentialCommand,
  InitiateAuthCommand,
  ListWebAuthnCredentialsCommand,
  RespondToAuthChallengeCommand,
  StartWebAuthnRegistrationCommand,
  type AuthenticationResultType,
} from '@aws-sdk/client-cognito-identity-provider';

import { establishSession, getCurrentSession, type SignInResult } from '@/lib/auth';

export type PasskeySummary = {
  credentialId: string;
  /** Cognito が付ける表示名。空のことがある。 */
  name: string;
  createdAt: Date | null;
};

type CognitoConfig = { clientId: string; region: string };

let cachedClient: { client: CognitoIdentityProviderClient; config: CognitoConfig } | null = null;

function getClient(): { client: CognitoIdentityProviderClient; config: CognitoConfig } {
  if (cachedClient) return cachedClient;

  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) {
    throw new Error(
      '認証設定が未構成です（VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_CLIENT_ID を設定してください）',
    );
  }

  // User Pool ID は `<region>_<id>` 形式。リージョンを別の環境変数にすると設定漏れの余地が増えるため導出する。
  const region = userPoolId.split('_')[0];
  if (!region) {
    throw new Error('VITE_COGNITO_USER_POOL_ID の形式が不正です（<region>_<id> 形式）');
  }
  cachedClient = {
    client: new CognitoIdentityProviderClient({ region }),
    config: { clientId, region },
  };
  return cachedClient;
}

/** ブラウザがパスキー（WebAuthn の JSON ヘルパー込み）を扱えるか。UI の出し分けに使う。 */
export function isPasskeySupported(): boolean {
  return (
    typeof globalThis.PublicKeyCredential === 'function' &&
    typeof globalThis.PublicKeyCredential.parseCreationOptionsFromJSON === 'function' &&
    typeof globalThis.PublicKeyCredential.parseRequestOptionsFromJSON === 'function' &&
    typeof globalThis.navigator?.credentials?.get === 'function'
  );
}

/** ログイン失敗の理由をユーザーに見せてよい形にした例外。 */
class PasskeyError extends Error {}

const LOGIN_FAILED_MESSAGE =
  'パスキーでログインできませんでした。パスキーを登録していない場合は、パスワードでログインしてください。';
const DOMAIN_MISMATCH_MESSAGE =
  'このドメインではパスキーを利用できません。本番のドメインから操作してください。';
const CANCELLED_MESSAGE = 'パスキーの操作がキャンセルされたか、時間切れになりました。';

// RP ID と現在のオリジンが合わない・プール側の設定が無いときに Cognito が返す例外名。
const DOMAIN_ERROR_NAMES = new Set([
  'WebAuthnOriginNotAllowedException',
  'WebAuthnRelyingPartyMismatchException',
  'WebAuthnConfigurationMissingException',
  'WebAuthnNotEnabledException',
]);

function errorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
}

function describeCommonError(error: unknown): string | null {
  const name = errorName(error);
  if (name === 'NotAllowedError' || name === 'AbortError') return CANCELLED_MESSAGE;
  // `SecurityError` はブラウザが RP ID と現在のドメインの不一致を検出したとき。
  if (name === 'SecurityError' || DOMAIN_ERROR_NAMES.has(name)) return DOMAIN_MISMATCH_MESSAGE;
  return null;
}

/**
 * ログイン失敗の文言。アカウントの有無や登録状況が推測できないよう、Cognito のメッセージは
 * 見せずに汎用文言へ丸める（パスワードログインの失敗時と同様の配慮）。
 */
function describeLoginError(error: unknown): string {
  if (error instanceof PasskeyError) return error.message;
  return describeCommonError(error) ?? LOGIN_FAILED_MESSAGE;
}

/** Cognito は WebAuthn のオプションを JSON ドキュメントとして返す（文字列で来る場合もある）。 */
function parseOptions(raw: unknown): object {
  const value = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  if (!value || typeof value !== 'object') {
    throw new PasskeyError(LOGIN_FAILED_MESSAGE);
  }
  return value;
}

function toTokens(result: AuthenticationResultType | undefined) {
  if (!result?.IdToken || !result.AccessToken || !result.RefreshToken) {
    throw new PasskeyError(LOGIN_FAILED_MESSAGE);
  }
  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
  };
}

export type SignInMethod = 'passkey' | 'password';

/**
 * メールアドレスから、そのアカウントがまず進むべきログイン方法を判定する（ログイン画面の分岐用）。
 *
 * パスキーを希望して `USER_AUTH` を開始し、Cognito が `WEB_AUTHN` チャレンジを返したときだけ
 * `'passkey'` にする。パスキー未登録・TOTP MFA 有効（選択型サインインではパスワードしか選べない）・
 * 存在しないメールアドレス・通信エラーはいずれも `'password'` に倒す。画面上で存在有無を区別して
 * 見せないためと、判定に失敗してもパスワードでログインできる状態を保つため。
 * ここで開始したセッションは使い捨てで、パスキー認証は `signInWithPasskey` が改めて開始する。
 */
export async function discoverSignInMethod(email: string): Promise<SignInMethod> {
  if (!isPasskeySupported()) return 'password';
  try {
    const { client, config } = getClient();
    const init = await client.send(
      new InitiateAuthCommand({
        ClientId: config.clientId,
        AuthFlow: 'USER_AUTH',
        AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'WEB_AUTHN' },
      }),
    );
    return init.ChallengeName === 'WEB_AUTHN' ? 'passkey' : 'password';
  } catch {
    return 'password';
  }
}

/**
 * パスキーでログインする。メールアドレスが必要（Cognito の `USER_AUTH` はユーザー名を先に渡す方式）。
 * TOTP MFA が有効なユーザーに Cognito が追加チャレンジを返した場合は、パスワードログインと同じ
 * `mfaRequired` を返し、画面側の既存の6桁コード入力に合流させる。
 */
export async function signInWithPasskey(email: string): Promise<SignInResult> {
  try {
    const { client, config } = getClient();

    const init = await client.send(
      new InitiateAuthCommand({
        ClientId: config.clientId,
        AuthFlow: 'USER_AUTH',
        AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'WEB_AUTHN' },
      }),
    );
    const rawOptions = init.ChallengeParameters?.CREDENTIAL_REQUEST_OPTIONS;
    if (init.ChallengeName !== 'WEB_AUTHN' || !init.Session || !rawOptions) {
      // パスキー未登録のユーザーでは別のチャレンジ（SELECT_CHALLENGE 等）が返る。
      throw new PasskeyError(LOGIN_FAILED_MESSAGE);
    }

    const credential = await navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(
        parseOptions(rawOptions) as PublicKeyCredentialRequestOptionsJSON,
      ),
    });
    if (!(credential instanceof PublicKeyCredential)) {
      throw new PasskeyError(LOGIN_FAILED_MESSAGE);
    }

    const response = await client.send(
      new RespondToAuthChallengeCommand({
        ClientId: config.clientId,
        ChallengeName: 'WEB_AUTHN',
        Session: init.Session,
        ChallengeResponses: { USERNAME: email, CREDENTIAL: JSON.stringify(credential.toJSON()) },
      }),
    );

    if (response.AuthenticationResult) {
      establishSession(email, toTokens(response.AuthenticationResult));
      return { status: 'success' };
    }

    if (response.ChallengeName === 'SOFTWARE_TOKEN_MFA' && response.Session) {
      const mfaSession = response.Session;
      return {
        status: 'mfaRequired',
        confirmMfaCode: async (code: string) => {
          try {
            const mfaResponse = await client.send(
              new RespondToAuthChallengeCommand({
                ClientId: config.clientId,
                ChallengeName: 'SOFTWARE_TOKEN_MFA',
                Session: mfaSession,
                ChallengeResponses: { USERNAME: email, SOFTWARE_TOKEN_MFA_CODE: code },
              }),
            );
            establishSession(email, toTokens(mfaResponse.AuthenticationResult));
          } catch (e) {
            if (e instanceof PasskeyError) throw e;
            throw new Error('認証コードが正しくありません');
          }
        },
      };
    }

    throw new PasskeyError(LOGIN_FAILED_MESSAGE);
  } catch (e) {
    // 画面には丸めた文言しか出さないため、原因調査用に例外名とメッセージだけ残す（メール・トークンは出さない）。
    console.error(
      '[passkey] sign-in failed:',
      errorName(e) || 'unknown',
      e instanceof Error ? e.message : '',
    );
    throw new Error(describeLoginError(e));
  }
}

async function requireAccessToken(): Promise<string> {
  const session = await getCurrentSession();
  if (!session) throw new Error('ログインしていません');
  return session.getAccessToken().getJwtToken();
}

/**
 * ログイン中のユーザーにこの端末のパスキーを登録する。登録 API はログイン済みのアクセストークンが前提。
 */
export async function registerPasskey(): Promise<void> {
  const accessToken = await requireAccessToken();
  const { client } = getClient();

  try {
    const start = await client.send(
      new StartWebAuthnRegistrationCommand({ AccessToken: accessToken }),
    );
    const options = parseOptions(start.CredentialCreationOptions);

    const credential = await navigator.credentials.create({
      publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(
        options as PublicKeyCredentialCreationOptionsJSON,
      ),
    });
    if (!(credential instanceof PublicKeyCredential)) {
      throw new Error('パスキーの登録に失敗しました');
    }

    await client.send(
      new CompleteWebAuthnRegistrationCommand({
        AccessToken: accessToken,
        // SDK の DocumentType は index signature を要求し、ブラウザの JSON 型（interface）とは
        // 型が合わないため、純粋な JSON に往復させて渡す。
        Credential: JSON.parse(JSON.stringify(credential.toJSON())),
      }),
    );
  } catch (e) {
    const common = describeCommonError(e);
    if (common) throw new Error(common);
    // 同じ認証器に登録済みのとき（excludeCredentials に一致）。
    if (errorName(e) === 'InvalidStateError') {
      throw new Error('この端末のパスキーは既に登録されています');
    }
    throw new Error(e instanceof Error && e.message ? e.message : 'パスキーの登録に失敗しました');
  }
}

/** ログイン中ユーザーが登録済みのパスキー一覧（登録が新しい順）。 */
export async function listPasskeys(): Promise<PasskeySummary[]> {
  const accessToken = await requireAccessToken();
  const { client } = getClient();

  const result: PasskeySummary[] = [];
  let nextToken: string | undefined;
  try {
    do {
      const page = await client.send(
        new ListWebAuthnCredentialsCommand({ AccessToken: accessToken, NextToken: nextToken }),
      );
      for (const credential of page.Credentials ?? []) {
        if (!credential.CredentialId) continue;
        result.push({
          credentialId: credential.CredentialId,
          name: credential.FriendlyCredentialName ?? '',
          createdAt: credential.CreatedAt ?? null,
        });
      }
      nextToken = page.NextToken;
    } while (nextToken);
  } catch (e) {
    throw new Error(e instanceof Error && e.message ? e.message : 'パスキーの取得に失敗しました');
  }

  return result.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/** 登録済みパスキーを削除する（Cognito 側の公開鍵が消えるだけで、端末側のパスキーは別途削除が必要）。 */
export async function deletePasskey(credentialId: string): Promise<void> {
  const accessToken = await requireAccessToken();
  const { client } = getClient();

  try {
    await client.send(
      new DeleteWebAuthnCredentialCommand({ AccessToken: accessToken, CredentialId: credentialId }),
    );
  } catch (e) {
    throw new Error(e instanceof Error && e.message ? e.message : 'パスキーの削除に失敗しました');
  }
}
