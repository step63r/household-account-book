import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';

/**
 * PUT /transactions/{id}
 * TODO: implement.
 * - Validate the request body with updateTransactionInputSchema from @household/shared.
 * - The transaction's `date` is part of its sort key (TXN#<date>#<txnId>); if `date` changes,
 *   this needs a delete+put (key change), not a plain update-in-place.
 * - Emit an audit log via lib/audit.ts logAudit({ userId, action: 'transaction.update',
 *   targetId }).
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    requireUserId(event);
    return jsonResponse(501, { message: 'Not implemented' });
  } catch (error) {
    return handleError(error);
  }
};
