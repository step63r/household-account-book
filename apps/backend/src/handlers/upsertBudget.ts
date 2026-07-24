import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoBudgetRepository } from '../repository/budgetRepository';
import { upsertBudget } from '../services/budgetService';

const repository = new DynamoBudgetRepository();

/** PUT /budgets - create-or-replace a budget. Validated with upsertBudgetInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const input = parseJsonBody(event.body);
    const budget = await upsertBudget(repository, userId, input);
    logAudit({
      userId,
      action: 'budget.upsert',
      targetId: `${budget.yearMonth}#${budget.categoryId}`,
    });
    return jsonResponse(200, budget);
  } catch (error) {
    return handleError(error);
  }
};
