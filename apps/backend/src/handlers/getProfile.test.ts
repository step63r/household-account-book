import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { handler as getProfileHandler } from './getProfile';

/**
 * These exercise handler-level concerns (JWT sub/email extraction, status-code mapping)
 * without touching AWS. Requests never reach the DynamoDB repository because
 * requireUserId()/requireEmail() short-circuit before any repository call.
 */
function buildEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/users/me',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'api.example.com',
      domainPrefix: 'api',
      http: {
        method: 'GET',
        path: '/users/me',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'request-id',
      routeKey: '$default',
      stage: '$default',
      time: '24/Jul/2026:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: {
        jwt: {
          claims: {},
          scopes: [],
        },
      },
    },
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2WithJWTAuthorizer;
}

function buildAuthenticatedEvent(
  userId: string,
  email: string | undefined,
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  const base = buildEvent();
  return buildEvent({
    ...overrides,
    requestContext: {
      ...base.requestContext,
      authorizer: {
        principalId: userId,
        integrationLatency: 0,
        jwt: { claims: { sub: userId, ...(email ? { email } : {}) }, scopes: [] },
      },
    },
  });
}

describe('getProfile handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent();

    const result = await getProfileHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 401 when the JWT email claim is missing', async () => {
    const event = buildAuthenticatedEvent('user-1', undefined);

    const result = await getProfileHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });
});
