import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { reorderCategoriesInputSchema } from '@household/shared';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { reorderCategories } from '../services/categoryService';
import { getUserContext } from '../services/userService';

const repository = new DynamoCategoryRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/** PUT /categories/reorder - reorder all of the household's categories (fixed and variable mixed). Validated with reorderCategoriesInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const rawInput = parseJsonBody(event.body);
    // Validate the body before the getUserContext() DynamoDB round trip (see updateCategory.ts).
    const input = reorderCategoriesInputSchema.parse(rawInput);
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const categories = await reorderCategories(repository, householdId, input);
    logAudit({ userId, action: 'category.reorder', targetId: 'household' });
    return jsonResponse(200, categories);
  } catch (error) {
    return handleError(error);
  }
};
