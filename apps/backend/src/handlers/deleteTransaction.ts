import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';

/**
 * DELETE /transactions/{id}
 * TODO: implement.
 * - Because the sort key is TXN#<date>#<txnId>, deleting by id alone requires either a
 *   GSI/lookup by id first, or accepting `date` as a query param so the sort key can be
 *   reconstructed directly - decide and document whichever approach is chosen.
 * - Emit an audit log via lib/audit.ts logAudit({ userId, action: 'transaction.delete',
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
