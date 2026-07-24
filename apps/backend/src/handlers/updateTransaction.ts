import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { updateTransaction } from '../services/transactionService';

const repository = new DynamoTransactionRepository();

/** PUT /transactions/{id} - update a transaction. Validated with updateTransactionInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const transactionId = event.pathParameters?.id;
    if (!transactionId) {
      throw new HttpError(400, 'Missing path parameter: id');
    }
    const input = parseJsonBody(event.body);
    const transaction = await updateTransaction(repository, userId, transactionId, input);
    logAudit({ userId, action: 'transaction.update', targetId: transaction.id });
    return jsonResponse(200, transaction);
  } catch (error) {
    return handleError(error);
  }
};
