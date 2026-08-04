import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { getMemoSuggestions, memoSuggestionsQuerySchema } from '../services/aggregationService';
import { getUserContext } from '../services/userService';

const transactionRepository = new DynamoTransactionRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/**
 * GET /aggregation/memo-suggestions?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 過去の摘要を直近使用日→使用回数の順で重複除去し、上位20件を返す。from/to省略時は全履歴が対象
 * （free プランは from を直近3ヶ月分にクランプする。listTransactionsと同じ period-filter の意味を持つため）。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    // Validate query params before the getUserContext() DynamoDB round trip (see getTrend.ts).
    memoSuggestionsQuerySchema.parse(event.queryStringParameters);
    const { plan, householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const suggestions = await getMemoSuggestions(
      transactionRepository,
      householdId,
      event.queryStringParameters,
      plan,
    );
    return jsonResponse(200, suggestions);
  } catch (error) {
    return handleError(error);
  }
};
