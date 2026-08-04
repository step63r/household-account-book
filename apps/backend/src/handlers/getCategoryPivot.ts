import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { categoryPivotQuerySchema, getCategoryPivot } from '../services/aggregationService';
import { getUserContext } from '../services/userService';

const transactionRepository = new DynamoTransactionRepository();
const categoryRepository = new DynamoCategoryRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/**
 * GET /aggregation/category-pivot?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week|month|year
 * 費目別ピボット（expenseのみ）。granularity省略時は 'month'。free プランは `from` を
 * 直近3ヶ月分にクランプする。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    // Validate query params before the getUserContext() DynamoDB round trip (see getTrend.ts).
    categoryPivotQuerySchema.parse(event.queryStringParameters);
    const { plan, householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const pivot = await getCategoryPivot(
      transactionRepository,
      categoryRepository,
      householdId,
      event.queryStringParameters,
      plan,
    );
    return jsonResponse(200, pivot);
  } catch (error) {
    return handleError(error);
  }
};
