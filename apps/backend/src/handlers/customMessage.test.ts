import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CustomMessageTriggerEvent } from 'aws-lambda';
import { handler as customMessageHandler } from './customMessage';

/**
 * Cognito CustomMessage trigger events aren't invoked through API Gateway, so unlike the
 * HTTP handlers this fixture models the raw event shape Cognito sends the Lambda directly.
 */
function buildEvent(
  overrides: Partial<CustomMessageTriggerEvent> = {},
): CustomMessageTriggerEvent {
  return {
    version: '1',
    region: 'ap-northeast-1',
    userPoolId: 'ap-northeast-1_example',
    triggerSource: 'CustomMessage_ForgotPassword',
    userName: 'user-1',
    callerContext: {
      awsSdkVersion: 'aws-sdk-unknown-unknown',
      clientId: 'client-id',
    },
    request: {
      userAttributes: { email: 'user+test@example.com' },
      codeParameter: '123456',
      linkParameter: '',
      usernameParameter: null,
    },
    response: {
      smsMessage: null,
      emailMessage: null,
      emailSubject: null,
    },
    ...overrides,
  } as CustomMessageTriggerEvent;
}

describe('customMessage handler', () => {
  const originalFrontendBaseUrl = process.env.FRONTEND_BASE_URL;

  beforeEach(() => {
    process.env.FRONTEND_BASE_URL = 'https://example.amplifyapp.com';
  });

  afterEach(() => {
    if (originalFrontendBaseUrl === undefined) {
      delete process.env.FRONTEND_BASE_URL;
    } else {
      process.env.FRONTEND_BASE_URL = originalFrontendBaseUrl;
    }
  });

  it('rewrites the forgot-password email to include a reset link with the encoded email and code', async () => {
    const event = buildEvent();

    const result = await customMessageHandler(event, {} as never, () => undefined);

    const expectedUrl =
      'https://example.amplifyapp.com/reset-password?email=user%2Btest%40example.com&code=123456';
    expect(result?.response.emailMessage).toContain(expectedUrl);
    expect(result?.response.emailSubject).toBe('【家計簿アプリ】パスワード再設定のご案内');
  });

  it('leaves the response untouched for other trigger sources', async () => {
    const event = buildEvent({
      triggerSource: 'CustomMessage_SignUp',
      response: {
        smsMessage: null,
        emailMessage: null,
        emailSubject: null,
      },
    });

    const result = await customMessageHandler(event, {} as never, () => undefined);

    expect(result?.response).toEqual(event.response);
  });

  it('throws when FRONTEND_BASE_URL is unset', async () => {
    delete process.env.FRONTEND_BASE_URL;
    const event = buildEvent();

    await expect(customMessageHandler(event, {} as never, () => undefined)).rejects.toThrow(
      'FRONTEND_BASE_URL',
    );
  });
});
