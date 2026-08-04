import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { yearMonthSchema } from '@household/shared';
import { requireEmail, requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoBudgetRepository } from '../repository/budgetRepository';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { listBudgets } from '../services/budgetService';
import { getUserContext } from '../services/userService';

const repository = new DynamoBudgetRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/** GET /budgets?yearMonth=YYYY-MM - list the caller's household's budgets for a month. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    // Validate query params before the getUserContext() DynamoDB round trip (see getTrend.ts).
    yearMonthSchema.parse(event.queryStringParameters?.yearMonth);
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const budgets = await listBudgets(
      repository,
      householdId,
      event.queryStringParameters?.yearMonth,
    );
    return jsonResponse(200, budgets);
  } catch (error) {
    return handleError(error);
  }
};
