import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { getMyProfile } from '../services/userService';

const repository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/**
 * GET /users/me - 現在のユーザープロフィール（フロントのプラン判定用に plan のみを含む
 * 最小限のレスポンス、userProfileResponseSchema参照）を返す。プロフィール未作成のユーザーは
 * ここで PROFILE アイテムを世帯ごと遅延作成する（getConsentStatus.ts と同じパターン）。
 * 読み取り専用のため監査ログなし。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const profile = await getMyProfile(repository, householdRepository, userId, email);
    return jsonResponse(200, profile);
  } catch (error) {
    return handleError(error);
  }
};
