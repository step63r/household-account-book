import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoCategoryRepository } from '../repository/categoryRepository';
import { listCategories } from '../services/categoryService';

const repository = new DynamoCategoryRepository();

/** GET /categories - list the caller's categories, lazily seeding presets on first call. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const categories = await listCategories(repository, userId);
    return jsonResponse(200, categories);
  } catch (error) {
    return handleError(error);
  }
};
