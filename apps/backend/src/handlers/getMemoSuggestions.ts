import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { getMemoSuggestions } from '../services/aggregationService';

const transactionRepository = new DynamoTransactionRepository();

/**
 * GET /aggregation/memo-suggestions?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 過去の摘要を直近使用日→使用回数の順で重複除去し、上位20件を返す。from/to省略時は全履歴が対象。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const suggestions = await getMemoSuggestions(transactionRepository, userId, event.queryStringParameters);
    return jsonResponse(200, suggestions);
  } catch (error) {
    return handleError(error);
  }
};
