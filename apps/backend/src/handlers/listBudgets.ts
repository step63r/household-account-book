import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';

/**
 * GET /budgets?yearMonth=YYYY-MM
 * TODO: implement.
 * - Validate `yearMonth` query param with yearMonthSchema from @household/shared.
 * - Query BUDGET#<yyyymm>#<categoryId> items via begins_with(SK, 'BUDGET#<yyyymm>#').
 * - Response items should validate against budgetSchema from @household/shared.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    requireUserId(event);
    return jsonResponse(501, { message: 'Not implemented' });
  } catch (error) {
    return handleError(error);
  }
};
