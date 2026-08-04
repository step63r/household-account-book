import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { createCategoryInputSchema } from '@household/shared';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { createCategory } from '../services/categoryService';
import { getUserContext } from '../services/userService';

const repository = new DynamoCategoryRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/** POST /categories - create a household-owned category. Validated with createCategoryInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const input = parseJsonBody(event.body);
    // Validate the body before the getUserContext() DynamoDB round trip, so a malformed request
    // short-circuits with 400 instead of paying for (and depending on) that call (see
    // createTransaction.ts).
    createCategoryInputSchema.parse(input);
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const category = await createCategory(repository, householdId, input);
    logAudit({ userId, action: 'category.create', targetId: category.id });
    return jsonResponse(201, category);
  } catch (error) {
    return handleError(error);
  }
};
