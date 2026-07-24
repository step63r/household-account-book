import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { handler as listTransactionsHandler } from './listTransactions';
import { handler as createTransactionHandler } from './createTransaction';
import { handler as updateTransactionHandler } from './updateTransaction';
import { handler as deleteTransactionHandler } from './deleteTransaction';

/**
 * These exercise handler-level concerns (JWT sub extraction, body parsing, status-code
 * mapping) without touching AWS. Requests never reach the DynamoDB repository because
 * requireUserId()/schema validation short-circuit before any repository call.
 */
function buildEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/transactions',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'api.example.com',
      domainPrefix: 'api',
      http: {
        method: 'GET',
        path: '/transactions',
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

describe('listTransactions handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent();

    const result = await listTransactionsHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });
});

describe('createTransaction handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent({ body: JSON.stringify({}) });

    const result = await createTransactionHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 400 for a missing request body', async () => {
    const event = buildAuthenticatedEvent('user-1', { body: undefined });

    const result = await createTransactionHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });

  it('returns 400 for a payload that fails createTransactionInputSchema validation', async () => {
    const event = buildAuthenticatedEvent('user-1', {
      body: JSON.stringify({ type: 'expense' }), // missing required date/categoryId/amount
    });

    const result = await createTransactionHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });
});

describe('updateTransaction handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent({ pathParameters: { id: 'txn-1' }, body: JSON.stringify({}) });

    const result = await updateTransactionHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 400 when the id path parameter is missing', async () => {
    const event = buildAuthenticatedEvent('user-1', {
      pathParameters: undefined,
      body: JSON.stringify({}),
    });

    const result = await updateTransactionHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });
});

describe('deleteTransaction handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent({ pathParameters: { id: 'txn-1' } });

    const result = await deleteTransactionHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 400 when the id path parameter is missing', async () => {
    const event = buildAuthenticatedEvent('user-1', { pathParameters: undefined });

    const result = await deleteTransactionHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });
});
