import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';

/**
 * GET /aggregation/trend?granularity=day|week|month&from=YYYY-MM-DD&to=YYYY-MM-DD
 * TODO: implement.
 * - Validate `granularity` with trendGranularitySchema from @household/shared.
 * - Query TXN# items for the caller in the [from, to] date range (sort-key range on
 *   TXN#<date>#<txnId>, never Scan), then bucket + sum in Lambda memory per CLAUDE.md's
 *   "aggregate in Lambda, not in DynamoDB" policy.
 * - MUST exclude type=transfer transactions from income/expense sums (CLAUDE.md: transfer
 *   feeds a separate 資産形成推移 aggregation, not this one).
 * - Response should be TrendPoint[] from @household/shared (aggregation.ts); period format
 *   depends on granularity: 'YYYY-MM-DD' / 'YYYY-Www' / 'YYYY-MM'.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    requireUserId(event);
    return jsonResponse(501, { message: 'Not implemented' });
  } catch (error) {
    return handleError(error);
  }
};
