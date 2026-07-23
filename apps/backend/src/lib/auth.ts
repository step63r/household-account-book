import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { UnauthorizedError } from './errors';

/**
 * API Gateway HTTP API routes in front of these handlers are protected by a JWT authorizer
 * backed by the Cognito User Pool. The authenticated user's id is the JWT `sub` claim,
 * available at `event.requestContext.authorizer.jwt.claims.sub`.
 */
export function requireUserId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new UnauthorizedError('Missing or invalid JWT sub claim');
  }
  return sub;
}
