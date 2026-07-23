import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';

/**
 * GET /transactions
 * TODO: implement.
 * - Accept optional `from`/`to` (YYYY-MM-DD) query params to scope the DynamoDB Query via
 *   the TXN#<date>#<txnId> sort-key range (begins_with / between) - never Scan.
 * - Add a src/repository/transactionRepository.ts (mirror categoryRepository.ts) plus a
 *   src/services/transactionService.ts with the pure listing logic, so this stays testable
 *   without hitting AWS, matching the categories reference slice.
 * - Response items should validate against transactionSchema from @household/shared.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    requireUserId(event);
    return jsonResponse(501, { message: 'Not implemented' });
  } catch (error) {
    return handleError(error);
  }
};
