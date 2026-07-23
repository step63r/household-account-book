import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';

/**
 * GET /aggregation/category-pivot?from=YYYY-MM-DD&to=YYYY-MM-DD
 * TODO: implement.
 * - Query TXN# items in the date range (never Scan) plus the caller's CATEGORY# items for
 *   name lookup, then pivot categoryId x period -> summed amount in Lambda memory.
 * - MUST exclude type=transfer transactions (see CLAUDE.md transfer exclusion rule, same as
 *   getTrend.ts).
 * - Response should be CategoryPivotRow[] from @household/shared (aggregation.ts).
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    requireUserId(event);
    return jsonResponse(501, { message: 'Not implemented' });
  } catch (error) {
    return handleError(error);
  }
};
