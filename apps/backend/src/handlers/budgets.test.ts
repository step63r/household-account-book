import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { handler as listBudgetsHandler } from './listBudgets';
import { handler as upsertBudgetHandler } from './upsertBudget';

/**
 * These exercise handler-level concerns (JWT sub extraction, body/query parsing,
 * status-code mapping) without touching AWS. Requests never reach the DynamoDB repository
 * because requireUserId()/schema validation short-circuit before any repository call.
 */
function buildEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/budgets',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'api.example.com',
      domainPrefix: 'api',
      http: {
        method: 'GET',
        path: '/budgets',
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
  email: string,
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
        jwt: { claims: { sub: userId, email }, scopes: [] },
      },
    },
  });
}

describe('listBudgets handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent();

    const result = await listBudgetsHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 400 when yearMonth query param is missing', async () => {
    const event = buildAuthenticatedEvent('user-1', 'user1@example.com');

    const result = await listBudgetsHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });
});

describe('upsertBudget handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent({ body: JSON.stringify({}) });

    const result = await upsertBudgetHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 400 for a missing request body', async () => {
    const event = buildAuthenticatedEvent('user-1', 'user1@example.com', { body: undefined });

    const result = await upsertBudgetHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });

  it('returns 400 for a payload that fails upsertBudgetInputSchema validation', async () => {
    const event = buildAuthenticatedEvent('user-1', 'user1@example.com', {
      body: JSON.stringify({ yearMonth: '2026-07' }), // missing categoryId/amount
    });

    const result = await upsertBudgetHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });
});
