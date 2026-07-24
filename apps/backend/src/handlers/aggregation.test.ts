import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { handler as getTrendHandler } from './getTrend';
import { handler as getCategoryPivotHandler } from './getCategoryPivot';
import { handler as getBudgetVarianceHandler } from './getBudgetVariance';

/**
 * These exercise handler-level concerns (JWT sub extraction, query-param validation,
 * status-code mapping) without touching AWS. Requests never reach the DynamoDB repository
 * because requireUserId()/schema validation short-circuit before any repository call.
 */
function buildEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/aggregation/trend',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'api.example.com',
      domainPrefix: 'api',
      http: {
        method: 'GET',
        path: '/aggregation/trend',
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
        jwt: { claims: { sub: userId }, scopes: [] },
      },
    },
  });
}

describe('getTrend handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent();

    const result = await getTrendHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 400 when required query params are missing', async () => {
    const event = buildAuthenticatedEvent('user-1');

    const result = await getTrendHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });
});

describe('getCategoryPivot handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent();

    const result = await getCategoryPivotHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 400 when required query params are missing', async () => {
    const event = buildAuthenticatedEvent('user-1');

    const result = await getCategoryPivotHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });
});

describe('getBudgetVariance handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent();

    const result = await getBudgetVarianceHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 400 when yearMonth query param is missing', async () => {
    const event = buildAuthenticatedEvent('user-1');

    const result = await getBudgetVarianceHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });
});
