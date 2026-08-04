import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoInviteRepository } from '../repository/inviteRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { acceptInvite } from '../services/householdService';
import { ensureProfileWithHousehold } from '../services/userService';

const householdRepository = new DynamoHouseholdRepository();
const userRepository = new DynamoUserRepository();
const inviteRepository = new DynamoInviteRepository();

/**
 * POST /invites/{token}/accept - 招待を承諾し、対象世帯に参加する。
 * 検証順序の詳細はhouseholdService.acceptInviteのコメント参照（安全性の要）。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const token = event.pathParameters?.token;
    if (!token) {
      throw new HttpError(400, 'Missing path parameter: token');
    }

    // Reuse ensureProfileWithHousehold's return value as callerProfile - it's already the
    // full User object needed to preserve non-household fields (plan, status, etc.) when
    // acceptInvite repoints householdId.
    const callerProfile = await ensureProfileWithHousehold(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const household = await acceptInvite(householdRepository, userRepository, inviteRepository, {
      token,
      callerUserId: userId,
      callerEmail: email,
      currentHouseholdId: callerProfile.householdId!,
      callerProfile,
    });

    logAudit({ userId, action: 'household.invite.accept', targetId: household.id });
    return jsonResponse(200, household);
  } catch (error) {
    return handleError(error);
  }
};
