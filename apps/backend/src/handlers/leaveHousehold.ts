import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { leaveHousehold } from '../services/householdService';
import { ensureProfileWithHousehold } from '../services/userService';

const householdRepository = new DynamoHouseholdRepository();
const userRepository = new DynamoUserRepository();

/**
 * POST /households/me/leave - 現在の世帯から脱退し、新しい空の世帯へ移る（データは持ち出さない）。
 * メンバーが自分のみの世帯では400(SOLE_MEMBER)を返し、退会フローへ誘導する。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);

    const callerProfile = await ensureProfileWithHousehold(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const household = await leaveHousehold(householdRepository, userRepository, {
      callerUserId: userId,
      currentHouseholdId: callerProfile.householdId!,
      callerProfile,
    });

    logAudit({ userId, action: 'household.leave', targetId: household.id });
    return jsonResponse(200, household);
  } catch (error) {
    return handleError(error);
  }
};
