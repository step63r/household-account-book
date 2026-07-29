import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { getTrend } from '../services/aggregationService';

const transactionRepository = new DynamoTransactionRepository();

/**
 * GET /aggregation/trend?granularity=day|week|month|year&from=YYYY-MM-DD&to=YYYY-MM-DD
 * transfer を除外した収支推移。日/週/月/年粒度でLambda側インメモリ集計する。from省略時は全履歴が対象。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const trend = await getTrend(transactionRepository, userId, event.queryStringParameters);
    return jsonResponse(200, trend);
  } catch (error) {
    return handleError(error);
  }
};
