import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { createCategory } from '../services/categoryService';

const repository = new DynamoCategoryRepository();

/** POST /categories - create a user-owned category. Validated with createCategoryInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const input = parseJsonBody(event.body);
    const category = await createCategory(repository, userId, input);
    logAudit({ userId, action: 'category.create', targetId: category.id });
    return jsonResponse(201, category);
  } catch (error) {
    return handleError(error);
  }
};
