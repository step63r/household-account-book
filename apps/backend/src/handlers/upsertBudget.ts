import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { upsertBudgetInputSchema } from '@household/shared';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoBudgetRepository } from '../repository/budgetRepository';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { upsertBudget } from '../services/budgetService';
import { getUserContext } from '../services/userService';

const repository = new DynamoBudgetRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/** PUT /budgets - create-or-replace a budget. Validated with upsertBudgetInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const input = parseJsonBody(event.body);
    // Validate the body before the getUserContext() DynamoDB round trip (see createTransaction.ts).
    upsertBudgetInputSchema.parse(input);
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const budget = await upsertBudget(repository, householdId, input);
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
