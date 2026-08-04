import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { deleteCategory } from '../services/categoryService';
import { getUserContext } from '../services/userService';

const repository = new DynamoCategoryRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/** DELETE /categories/{id} - delete a category. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const categoryId = event.pathParameters?.id;
    if (!categoryId) {
      throw new HttpError(400, 'Missing path parameter: id');
    }
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    await deleteCategory(repository, householdId, categoryId);
    logAudit({ userId, action: 'category.delete', targetId: categoryId });
    return jsonResponse(204);
  } catch (error) {
    return handleError(error);
  }
};
