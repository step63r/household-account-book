import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { getCategoryPivot } from '../services/aggregationService';

const transactionRepository = new DynamoTransactionRepository();
const categoryRepository = new DynamoCategoryRepository();

/**
 * GET /aggregation/category-pivot?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week|month
 * 費目別ピボット（expenseのみ）。granularity省略時は 'month'。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const pivot = await getCategoryPivot(
      transactionRepository,
      categoryRepository,
      userId,
      event.queryStringParameters,
    );
    return jsonResponse(200, pivot);
  } catch (error) {
    return handleError(error);
  }
};
