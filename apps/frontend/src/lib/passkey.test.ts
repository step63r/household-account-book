import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock, establishSessionMock, getCurrentSessionMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  establishSessionMock: vi.fn(),
  getCurrentSessionMock: vi.fn(),
}));

// コマンドは入力を保持するだけのスタブにし、`send` に渡された順序と中身で挙動を検証する。
vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  const makeCommand = (name: string) =>
    class {
      readonly commandName = name;
      readonly input: Record<string, unknown>;
      constructor(input: Record<string, unknown>) {
        this.input = input;
      }
    };
  return {
    CognitoIdentityProviderClient: class {
      send = sendMock;
    },
    InitiateAuthCommand: makeCommand('InitiateAuth'),
    RespondToAuthChallengeCommand: makeCommand('RespondToAuthChallenge'),
    StartWebAuthnRegistrationCommand: makeCommand('StartWebAuthnRegistration'),
    CompleteWebAuthnRegistrationCommand: makeCommand('CompleteWebAuthnRegistration'),
    ListWebAuthnCredentialsCommand: makeCommand('ListWebAuthnCredentials'),
    DeleteWebAuthnCredentialCommand: makeCommand('DeleteWebAuthnCredential'),
  };
});

vi.mock('@/lib/auth', () => ({
  establishSession: establishSessionMock,
  getCurrentSession: getCurrentSessionMock,
}));

import {
  deletePasskey,
  discoverSignInMethod,
  isPasskeySupported,
  listPasskeys,
  registerPasskey,
  signInWithPasskey,
} from './passkey';

const TOKENS = { IdToken: 'id', AccessToken: 'access', RefreshToken: 'refresh' };

class FakePublicKeyCredential {
  static parseRequestOptionsFromJSON = vi.fn((o: unknown) => ({ parsedRequest: o }));
  static parseCreationOptionsFromJSON = vi.fn((o: unknown) => ({ parsedCreation: o }));
  toJSON() {
    return { id: 'cred-id', type: 'public-key' };
  }
}

const credentialsGet = vi.fn();
const credentialsCreate = vi.fn();

function commandNames(): string[] {
  return sendMock.mock.calls.map(([command]) => (command as { commandName: string }).commandName);
}

function commandInput(name: string): Record<string, unknown> {
  const call = sendMock.mock.calls.find(
    ([command]) => (command as { commandName: string }).commandName === name,
  );
  if (!call) throw new Error(`${name} was not sent`);
  return (call[0] as { input: Record<string, unknown> }).input;
}

beforeEach(() => {
  vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'ap-northeast-1_abc123');
  vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'client-1');
  vi.stubGlobal('PublicKeyCredential', FakePublicKeyCredential);
  vi.stubGlobal('navigator', { credentials: { get: credentialsGet, create: credentialsCreate } });
  getCurrentSessionMock.mockResolvedValue({
    getAccessToken: () => ({ getJwtToken: () => 'access-jwt' }),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  sendMock.mockReset();
  credentialsGet.mockReset();
  credentialsCreate.mockReset();
});

describe('isPasskeySupported', () => {
  it('WebAuthn の JSON ヘルパーが揃っていれば true', () => {
    expect(isPasskeySupported()).toBe(true);
  });

  it('PublicKeyCredential が無ければ false', () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    expect(isPasskeySupported()).toBe(false);
  });

  it('JSON ヘルパーが無い古いブラウザでは false', () => {
    vi.stubGlobal('PublicKeyCredential', class {});
    expect(isPasskeySupported()).toBe(false);
  });
});

describe('discoverSignInMethod', () => {
  it('パスキーを希望して開始し、WEB_AUTHN チャレンジが返れば passkey', async () => {
    sendMock.mockResolvedValueOnce({ ChallengeName: 'WEB_AUTHN', Session: 's' });

    await expect(discoverSignInMethod('a@example.com')).resolves.toBe('passkey');
    expect(commandInput('InitiateAuth')).toMatchObject({
      AuthFlow: 'USER_AUTH',
      AuthParameters: { USERNAME: 'a@example.com', PREFERRED_CHALLENGE: 'WEB_AUTHN' },
    });
    // 判定だけで認証器やセッション保存には触れない。
    expect(credentialsGet).not.toHaveBeenCalled();
    expect(establishSessionMock).not.toHaveBeenCalled();
  });

  it('パスキー未登録・TOTP有効（パスワードしか選べない）なら password', async () => {
    sendMock.mockResolvedValueOnce({
      ChallengeName: 'SELECT_CHALLENGE',
      AvailableChallenges: ['PASSWORD_SRP', 'PASSWORD'],
    });

    await expect(discoverSignInMethod('a@example.com')).resolves.toBe('password');
  });

  it('存在しないメールアドレスも通信エラーも、例外にせず password に倒す', async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('User does not exist.'), { name: 'UserNotFoundException' }),
    );
    await expect(discoverSignInMethod('nobody@example.com')).resolves.toBe('password');

    sendMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(discoverSignInMethod('a@example.com')).resolves.toBe('password');
  });

  it('ブラウザがパスキー非対応なら Cognito を呼ばずに password', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);

    await expect(discoverSignInMethod('a@example.com')).resolves.toBe('password');
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('signInWithPasskey', () => {
  function stubWebAuthnChallenge() {
    sendMock.mockResolvedValueOnce({
      ChallengeName: 'WEB_AUTHN',
      Session: 'session-1',
      ChallengeParameters: { CREDENTIAL_REQUEST_OPTIONS: JSON.stringify({ challenge: 'abc' }) },
    });
    credentialsGet.mockResolvedValueOnce(new FakePublicKeyCredential());
  }

  it('チャレンジ → 認証器 → 応答の順に呼び、トークンをセッションとして保存する', async () => {
    stubWebAuthnChallenge();
    sendMock.mockResolvedValueOnce({ AuthenticationResult: TOKENS });

    const result = await signInWithPasskey('a@example.com');

    expect(result).toEqual({ status: 'success' });
    expect(commandNames()).toEqual(['InitiateAuth', 'RespondToAuthChallenge']);
    expect(commandInput('InitiateAuth')).toMatchObject({
      ClientId: 'client-1',
      AuthFlow: 'USER_AUTH',
      AuthParameters: { USERNAME: 'a@example.com', PREFERRED_CHALLENGE: 'WEB_AUTHN' },
    });
    expect(credentialsGet).toHaveBeenCalledWith({
      publicKey: { parsedRequest: { challenge: 'abc' } },
    });
    expect(commandInput('RespondToAuthChallenge')).toMatchObject({
      ChallengeName: 'WEB_AUTHN',
      Session: 'session-1',
      ChallengeResponses: {
        USERNAME: 'a@example.com',
        CREDENTIAL: JSON.stringify({ id: 'cred-id', type: 'public-key' }),
      },
    });
    expect(establishSessionMock).toHaveBeenCalledWith('a@example.com', {
      idToken: 'id',
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });

  it('TOTP MFA が要求されたら mfaRequired を返し、コード確認後にセッションを保存する', async () => {
    stubWebAuthnChallenge();
    sendMock.mockResolvedValueOnce({ ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 'session-2' });

    const result = await signInWithPasskey('a@example.com');

    expect(result.status).toBe('mfaRequired');
    expect(establishSessionMock).not.toHaveBeenCalled();

    sendMock.mockResolvedValueOnce({ AuthenticationResult: TOKENS });
    if (result.status !== 'mfaRequired') throw new Error('unreachable');
    await result.confirmMfaCode('123456');

    expect(sendMock.mock.calls.at(-1)?.[0]).toMatchObject({
      input: {
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        Session: 'session-2',
        ChallengeResponses: { USERNAME: 'a@example.com', SOFTWARE_TOKEN_MFA_CODE: '123456' },
      },
    });
    expect(establishSessionMock).toHaveBeenCalledOnce();
  });

  it('パスキー未登録で WEB_AUTHN 以外のチャレンジが返ると、汎用文言で失敗し認証器は呼ばない', async () => {
    sendMock.mockResolvedValueOnce({ ChallengeName: 'SELECT_CHALLENGE', Session: 's' });

    await expect(signInWithPasskey('a@example.com')).rejects.toThrow(
      'パスキーでログインできません',
    );
    expect(credentialsGet).not.toHaveBeenCalled();
    expect(establishSessionMock).not.toHaveBeenCalled();
  });

  it('ユーザーが認証器の操作をキャンセルしたらキャンセル文言を返す', async () => {
    sendMock.mockResolvedValueOnce({
      ChallengeName: 'WEB_AUTHN',
      Session: 's',
      ChallengeParameters: { CREDENTIAL_REQUEST_OPTIONS: '{}' },
    });
    credentialsGet.mockRejectedValueOnce(
      Object.assign(new Error('x'), { name: 'NotAllowedError' }),
    );

    await expect(signInWithPasskey('a@example.com')).rejects.toThrow('キャンセル');
  });

  it('RP ID 不一致（localhost 等）はドメイン不一致の文言を返す', async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('raw cognito message'), {
        name: 'WebAuthnOriginNotAllowedException',
      }),
    );

    await expect(signInWithPasskey('a@example.com')).rejects.toThrow(
      'このドメインではパスキーを利用できません',
    );
  });

  it('Cognito の生のエラーメッセージ（アカウント有無の手掛かり）は画面に出さない', async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('User does not exist.'), { name: 'UserNotFoundException' }),
    );

    await expect(signInWithPasskey('a@example.com')).rejects.toThrow(
      /^パスキーでログインできませんでした/,
    );
  });

  it('認証結果にリフレッシュトークンが無ければセッションを保存せず失敗する', async () => {
    stubWebAuthnChallenge();
    sendMock.mockResolvedValueOnce({ AuthenticationResult: { IdToken: 'id', AccessToken: 'a' } });

    await expect(signInWithPasskey('a@example.com')).rejects.toThrow();
    expect(establishSessionMock).not.toHaveBeenCalled();
  });
});

describe('registerPasskey', () => {
  it('開始 → 認証器で作成 → 完了の順に、ログイン中のアクセストークンで呼ぶ', async () => {
    sendMock.mockResolvedValueOnce({ CredentialCreationOptions: { challenge: 'xyz' } });
    credentialsCreate.mockResolvedValueOnce(new FakePublicKeyCredential());
    sendMock.mockResolvedValueOnce({});

    await registerPasskey();

    expect(commandNames()).toEqual(['StartWebAuthnRegistration', 'CompleteWebAuthnRegistration']);
    expect(commandInput('StartWebAuthnRegistration')).toEqual({ AccessToken: 'access-jwt' });
    expect(credentialsCreate).toHaveBeenCalledWith({
      publicKey: { parsedCreation: { challenge: 'xyz' } },
    });
    expect(commandInput('CompleteWebAuthnRegistration')).toEqual({
      AccessToken: 'access-jwt',
      Credential: { id: 'cred-id', type: 'public-key' },
    });
  });

  it('未ログインなら Cognito を呼ばずに失敗する', async () => {
    getCurrentSessionMock.mockResolvedValueOnce(null);

    await expect(registerPasskey()).rejects.toThrow('ログインしていません');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('登録済みの認証器への再登録は専用の文言を返す', async () => {
    sendMock.mockResolvedValueOnce({ CredentialCreationOptions: {} });
    credentialsCreate.mockRejectedValueOnce(
      Object.assign(new Error('x'), { name: 'InvalidStateError' }),
    );

    await expect(registerPasskey()).rejects.toThrow('既に登録されています');
  });
});

describe('listPasskeys / deletePasskey', () => {
  it('ページングを辿り、登録が新しい順に並べる', async () => {
    sendMock
      .mockResolvedValueOnce({
        Credentials: [
          { CredentialId: 'old', FriendlyCredentialName: 'A', CreatedAt: new Date('2026-01-01') },
        ],
        NextToken: 'next',
      })
      .mockResolvedValueOnce({
        Credentials: [{ CredentialId: 'new', CreatedAt: new Date('2026-06-01') }, {}],
      });

    const result = await listPasskeys();

    expect(result.map((p) => p.credentialId)).toEqual(['new', 'old']);
    expect(result[0]?.name).toBe('');
    expect(sendMock.mock.calls[1]?.[0]).toMatchObject({ input: { NextToken: 'next' } });
  });

  it('削除は資格情報IDとアクセストークンで呼ぶ', async () => {
    sendMock.mockResolvedValueOnce({});

    await deletePasskey('cred-1');

    expect(commandInput('DeleteWebAuthnCredential')).toEqual({
      AccessToken: 'access-jwt',
      CredentialId: 'cred-1',
    });
  });
});
