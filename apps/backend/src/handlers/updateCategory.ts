import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { updateCategoryInputSchema } from '@household/shared';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { updateCategory } from '../services/categoryService';
import { getUserContext } from '../services/userService';

const repository = new DynamoCategoryRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/** PUT /categories/{id} - update a category. Validated with updateCategoryInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const categoryId = event.pathParameters?.id;
    if (!categoryId) {
      throw new HttpError(400, 'Missing path parameter: id');
    }
    const input = parseJsonBody(event.body);
    // Validate the body before the getUserContext() DynamoDB round trip (see createCategory.ts).
    updateCategoryInputSchema.parse(input);
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const category = await updateCategory(repository, householdId, categoryId, input);
    logAudit({ userId, action: 'category.update', targetId: category.id });
    return jsonResponse(200, category);
  } catch (error) {
    return handleError(error);
  }
};
