import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoBudgetRepository } from '../repository/budgetRepository';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { budgetVarianceQuerySchema, getBudgetVariance } from '../services/aggregationService';
import { getUserPlan } from '../services/userService';

const transactionRepository = new DynamoTransactionRepository();
const budgetRepository = new DynamoBudgetRepository();
const categoryRepository = new DynamoCategoryRepository();
const userRepository = new DynamoUserRepository();

/**
 * GET /aggregation/budget-variance?yearMonth=YYYY-MM
 * 予実差（指定月・費目別、expenseのみ）。varianceAmount = actualAmount - budgetAmount。
 * free プランは yearMonth を直近3ヶ月分にクランプする。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    // Validate query params before the getUserPlan() DynamoDB round trip (see getTrend.ts).
    budgetVarianceQuerySchema.parse(event.queryStringParameters);
    const plan = await getUserPlan(userRepository, userId);
    const rows = await getBudgetVariance(
      transactionRepository,
      budgetRepository,
      categoryRepository,
      userId,
      event.queryStringParameters,
      plan,
    );
    return jsonResponse(200, rows);
  } catch (error) {
    return handleError(error);
  }
};
