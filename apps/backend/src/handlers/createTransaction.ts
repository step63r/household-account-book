import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { createTransaction } from '../services/transactionService';

const repository = new DynamoTransactionRepository();

/** POST /transactions - create a transaction. Validated with createTransactionInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const input = parseJsonBody(event.body);
    const transaction = await createTransaction(repository, userId, input);
    logAudit({ userId, action: 'transaction.create', targetId: transaction.id });
    return jsonResponse(201, transaction);
  } catch (error) {
    return handleError(error);
  }
};
