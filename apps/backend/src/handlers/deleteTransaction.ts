import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { deleteTransaction } from '../services/transactionService';

const repository = new DynamoTransactionRepository();

/**
 * DELETE /transactions/{id} - delete a transaction.
 * The sort key embeds `date` (TXN#<date>#<txnId>), which isn't derivable from `id` alone, so
 * the service looks the transaction up first (Query + in-memory filter, no GSI - see
 * infra/lib/data-stack.ts) to resolve `date` before deleting. No `date` query param is
 * required from the caller.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const transactionId = event.pathParameters?.id;
    if (!transactionId) {
      throw new HttpError(400, 'Missing path parameter: id');
    }
    await deleteTransaction(repository, userId, transactionId);
    logAudit({ userId, action: 'transaction.delete', targetId: transactionId });
    return jsonResponse(204);
  } catch (error) {
    return handleError(error);
  }
};
