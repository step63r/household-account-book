import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';

/**
 * POST /transactions
 * TODO: implement.
 * - Validate the request body with createTransactionInputSchema from @household/shared.
 * - type=income/expense require categoryId; type=transfer may omit it (see transaction.ts
 *   comment "transfer では未設定でもよい") - enforce that pairing server-side.
 * - Persist under USER#<userId> / TXN#<date>#<txnId> (see repository/categoryRepository.ts
 *   for the pattern: a repository interface + Dynamo implementation + a testable service
 *   function that the handler delegates to).
 * - Emit an audit log via lib/audit.ts logAudit({ userId, action: 'transaction.create',
 *   targetId }) - mutating endpoints must always audit-log (CLAUDE.md).
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    requireUserId(event);
    return jsonResponse(501, { message: 'Not implemented' });
  } catch (error) {
    return handleError(error);
  }
};
