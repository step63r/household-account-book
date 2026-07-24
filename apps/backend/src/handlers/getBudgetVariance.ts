import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoBudgetRepository } from '../repository/budgetRepository';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { getBudgetVariance } from '../services/aggregationService';

const transactionRepository = new DynamoTransactionRepository();
const budgetRepository = new DynamoBudgetRepository();
const categoryRepository = new DynamoCategoryRepository();

/**
 * GET /aggregation/budget-variance?yearMonth=YYYY-MM
 * 予実差（指定月・費目別、expenseのみ）。varianceAmount = actualAmount - budgetAmount。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const rows = await getBudgetVariance(
      transactionRepository,
      budgetRepository,
      categoryRepository,
      userId,
      event.queryStringParameters,
    );
    return jsonResponse(200, rows);
  } catch (error) {
    return handleError(error);
  }
};
