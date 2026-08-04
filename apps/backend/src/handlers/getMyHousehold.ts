import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { getMyHousehold } from '../services/householdService';
import { ensureProfileWithHousehold } from '../services/userService';

const householdRepository = new DynamoHouseholdRepository();
const userRepository = new DynamoUserRepository();

/**
 * GET /households/me - 現在のユーザーが所属する世帯のプロフィール＋メンバー一覧を返す。
 * プロフィール未作成のユーザーはここで世帯ごと遅延作成する（getMyProfile.ts等と同じパターン）。
 * 読み取り専用のため監査ログなし。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const user = await ensureProfileWithHousehold(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const household = await getMyHousehold(householdRepository, userRepository, user.householdId!);
    return jsonResponse(200, household);
  } catch (error) {
    return handleError(error);
  }
};
