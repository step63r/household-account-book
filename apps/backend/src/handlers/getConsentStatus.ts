import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { getConsentStatus } from '../services/userService';

const repository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/**
 * GET /users/me/consent - 現在の同意状況（利用規約・プライバシーポリシーの結合バージョン）を返す。
 * プロフィール未作成のユーザーはここで PROFILE アイテムを世帯ごと遅延作成する
 * （categoryService.listCategories のプリセット遅延投入と同じパターン）。読み取り専用のため監査ログなし。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const status = await getConsentStatus(repository, householdRepository, userId, email);
    return jsonResponse(200, status);
  } catch (error) {
    return handleError(error);
  }
};
