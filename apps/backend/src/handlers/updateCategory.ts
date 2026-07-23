import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { updateCategory } from '../services/categoryService';

const repository = new DynamoCategoryRepository();

/** PUT /categories/{id} - update a category. Validated with updateCategoryInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const categoryId = event.pathParameters?.id;
    if (!categoryId) {
      throw new HttpError(400, 'Missing path parameter: id');
    }
    const input = parseJsonBody(event.body);
    const category = await updateCategory(repository, userId, categoryId, input);
    logAudit({ userId, action: 'category.update', targetId: category.id });
    return jsonResponse(200, category);
  } catch (error) {
    return handleError(error);
  }
};
