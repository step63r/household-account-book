import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { handler as getMyHouseholdHandler } from './getMyHousehold';
import { handler as updateHouseholdHandler } from './updateHousehold';
import { handler as createInviteHandler } from './createInvite';
import { handler as previewInviteHandler } from './previewInvite';
import { handler as acceptInviteHandler } from './acceptInvite';
import { handler as leaveHouseholdHandler } from './leaveHousehold';

/**
 * These exercise handler-level concerns (JWT sub/email extraction, path-param handling,
 * status-code mapping) without touching AWS. Requests never reach the DynamoDB repository
 * because requireUserId()/requireEmail() (or, for previewInvite, a missing path param) short-
 * circuit before any repository call.
 */
function buildEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/households/me',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'api.example.com',
      domainPrefix: 'api',
      http: {
        method: 'GET',
        path: '/households/me',
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

describe('getMyHousehold handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent();

    const result = await getMyHouseholdHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 401 when the JWT email claim is missing', async () => {
    const event = buildAuthenticatedEvent('user-1', undefined);

    const result = await getMyHouseholdHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });
});

describe('updateHousehold handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent({ body: JSON.stringify({ name: '新しい世帯名' }) });

    const result = await updateHouseholdHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 401 when the JWT email claim is missing', async () => {
    const event = buildAuthenticatedEvent('user-1', undefined, {
      body: JSON.stringify({ name: '新しい世帯名' }),
    });

    const result = await updateHouseholdHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 400 for a missing request body', async () => {
    const event = buildAuthenticatedEvent('user-1', 'user1@example.com', { body: undefined });

    const result = await updateHouseholdHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });
});

describe('createInvite handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent({ body: JSON.stringify({ email: 'invitee@example.com' }) });

    const result = await createInviteHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 401 when the JWT email claim is missing', async () => {
    const event = buildAuthenticatedEvent('user-1', undefined, {
      body: JSON.stringify({ email: 'invitee@example.com' }),
    });

    const result = await createInviteHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 400 for a missing request body', async () => {
    const event = buildAuthenticatedEvent('user-1', 'user1@example.com', { body: undefined });

    const result = await createInviteHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });
});

describe('previewInvite handler', () => {
  it('returns 404 when the token path parameter is missing (no request context/authorizer at all)', async () => {
    // This route has no authorizer configured (see previewInvite.ts) - the event shape here
    // deliberately has no requestContext.authorizer to prove the handler doesn't assume one.
    const event = { pathParameters: undefined } as unknown as APIGatewayProxyEventV2;

    const result = await previewInviteHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 404 });
  });
});

describe('acceptInvite handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent({ pathParameters: { token: 'token-1' } });

    const result = await acceptInviteHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 401 when the JWT email claim is missing', async () => {
    const event = buildAuthenticatedEvent('user-1', undefined, {
      pathParameters: { token: 'token-1' },
    });

    const result = await acceptInviteHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 400 when the token path parameter is missing', async () => {
    const event = buildAuthenticatedEvent('user-1', 'user1@example.com', {
      pathParameters: undefined,
    });

    const result = await acceptInviteHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });
});

describe('leaveHousehold handler', () => {
  it('returns 401 when the JWT sub claim is missing', async () => {
    const event = buildEvent();

    const result = await leaveHouseholdHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('returns 401 when the JWT email claim is missing', async () => {
    const event = buildAuthenticatedEvent('user-1', undefined);

    const result = await leaveHouseholdHandler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });
});
