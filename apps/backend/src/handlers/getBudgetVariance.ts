import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoBudgetRepository } from '../repository/budgetRepository';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { budgetVarianceQuerySchema, getBudgetVariance } from '../services/aggregationService';
import { getUserContext } from '../services/userService';

const transactionRepository = new DynamoTransactionRepository();
const budgetRepository = new DynamoBudgetRepository();
const categoryRepository = new DynamoCategoryRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/**
 * GET /aggregation/budget-variance?yearMonth=YYYY-MM
 * 予実差（指定月・費目別、expenseのみ）。varianceAmount = actualAmount - budgetAmount。
 * free プランは yearMonth を直近3ヶ月分にクランプする。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    // Validate query params before the getUserContext() DynamoDB round trip (see getTrend.ts).
    budgetVarianceQuerySchema.parse(event.queryStringParameters);
    const { plan, householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const rows = await getBudgetVariance(
      transactionRepository,
      budgetRepository,
      categoryRepository,
      householdId,
      event.queryStringParameters,
      plan,
    );
    return jsonResponse(200, rows);
  } catch (error) {
    return handleError(error);
  }
};
