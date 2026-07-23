import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';

/**
 * GET /aggregation/budget-variance?yearMonth=YYYY-MM
 * TODO: implement.
 * - Validate `yearMonth` with yearMonthSchema from @household/shared.
 * - Query BUDGET#<yearMonth>#<categoryId> items and TXN# items for that month (never Scan),
 *   sum actuals per category in Lambda memory.
 * - MUST exclude type=transfer transactions from actualAmount (budgets only cover
 *   income/expense categories per CLAUDE.md).
 * - Response should be BudgetVarianceRow[] from @household/shared (aggregation.ts);
 *   varianceAmount = actualAmount - budgetAmount.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    requireUserId(event);
    return jsonResponse(501, { message: 'Not implemented' });
  } catch (error) {
    return handleError(error);
  }
};
