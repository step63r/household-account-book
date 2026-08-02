import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { listTransactions } from '../services/transactionService';
import { getUserPlan } from '../services/userService';

const repository = new DynamoTransactionRepository();
const userRepository = new DynamoUserRepository();

/**
 * GET /transactions?from=YYYY-MM-DD&to=YYYY-MM-DD - list the caller's transactions.
 * free プランは `from` を直近3ヶ月分の下限にクランプする（エラーにはしない）。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const from = event.queryStringParameters?.from;
    const to = event.queryStringParameters?.to;
    const plan = await getUserPlan(userRepository, userId);
    const transactions = await listTransactions(repository, userId, { from, to }, plan);
    return jsonResponse(200, transactions);
  } catch (error) {
    return handleError(error);
  }
};
