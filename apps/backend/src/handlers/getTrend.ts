import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { getTrend, trendQuerySchema } from '../services/aggregationService';
import { getUserContext } from '../services/userService';

const transactionRepository = new DynamoTransactionRepository();
const categoryRepository = new DynamoCategoryRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/**
 * GET /aggregation/trend?granularity=day|week|month|year&from=YYYY-MM-DD&to=YYYY-MM-DD&excludeFixed=true
 * transfer を除外した収支推移。日/週/月/年粒度でLambda側インメモリ集計する。from省略時は全履歴が対象
 * （ただし free プランは直近3ヶ月分にクランプされる）。excludeFixed=true指定時は固定費の費目を
 * expenseの合計から除外する（ダッシュボードの収支推移グラフ専用）。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    // Validate query params before the getUserContext() DynamoDB round trip, so a malformed
    // request short-circuits with 400 instead of paying for (and depending on) that call.
    trendQuerySchema.parse(event.queryStringParameters);
    const { plan, householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const trend = await getTrend(
      transactionRepository,
      categoryRepository,
      householdId,
      event.queryStringParameters,
      plan,
    );
    return jsonResponse(200, trend);
  } catch (error) {
    return handleError(error);
  }
};
