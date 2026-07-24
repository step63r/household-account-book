import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoBudgetRepository } from '../repository/budgetRepository';
import { listBudgets } from '../services/budgetService';

const repository = new DynamoBudgetRepository();

/** GET /budgets?yearMonth=YYYY-MM - list the caller's budgets for a month. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const budgets = await listBudgets(repository, userId, event.queryStringParameters?.yearMonth);
    return jsonResponse(200, budgets);
  } catch (error) {
    return handleError(error);
  }
};
