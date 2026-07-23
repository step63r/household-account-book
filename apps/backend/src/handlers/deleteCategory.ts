import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { deleteCategory } from '../services/categoryService';

const repository = new DynamoCategoryRepository();

/** DELETE /categories/{id} - delete a category. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const categoryId = event.pathParameters?.id;
    if (!categoryId) {
      throw new HttpError(400, 'Missing path parameter: id');
    }
    await deleteCategory(repository, userId, categoryId);
    logAudit({ userId, action: 'category.delete', targetId: categoryId });
    return jsonResponse(204);
  } catch (error) {
    return handleError(error);
  }
};
