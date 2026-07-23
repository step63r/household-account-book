import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';

/**
 * PUT /budgets
 * TODO: implement.
 * - Validate the request body with upsertBudgetInputSchema from @household/shared
 *   ({ yearMonth, categoryId, amount }).
 * - Budgets are keyed by month + expense category: PutItem at
 *   USER#<userId> / BUDGET#<yearMonth>#<categoryId> is naturally idempotent (create-or-replace),
 *   no separate create/update split needed.
 * - Emit an audit log via lib/audit.ts logAudit({ userId, action: 'budget.upsert', targetId })
 *   where targetId is `${yearMonth}#${categoryId}`.
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    requireUserId(event);
    return jsonResponse(501, { message: 'Not implemented' });
  } catch (error) {
    return handleError(error);
  }
};
