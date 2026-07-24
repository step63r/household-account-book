import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { listTransactions } from '../services/transactionService';

const repository = new DynamoTransactionRepository();

/** GET /transactions?from=YYYY-MM-DD&to=YYYY-MM-DD - list the caller's transactions. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const from = event.queryStringParameters?.from;
    const to = event.queryStringParameters?.to;
    const transactions = await listTransactions(repository, userId, { from, to });
    return jsonResponse(200, transactions);
  } catch (error) {
    return handleError(error);
  }
};
