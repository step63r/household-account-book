import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { SesEmailSender } from '../lib/email';
import { HttpError, handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoInviteRepository } from '../repository/inviteRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { createInvite } from '../services/householdService';
import { ensureProfileWithHousehold } from '../services/userService';

const householdRepository = new DynamoHouseholdRepository();
const userRepository = new DynamoUserRepository();
const inviteRepository = new DynamoInviteRepository();

/**
 * POST /households/me/invites - 現在の世帯への招待を発行し、招待メールを送信する。
 * Validated with createInviteInputSchema (householdService.createInvite内でparse)。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const input = parseJsonBody(event.body);

    const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
    if (!frontendBaseUrl) {
      throw new Error('FRONTEND_BASE_URL environment variable is not set');
    }
    const senderEmail = process.env.SENDER_EMAIL;
    if (!senderEmail) {
      throw new Error('SENDER_EMAIL environment variable is not set');
    }

    const user = await ensureProfileWithHousehold(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const household = await householdRepository.getProfile(user.householdId!);
    if (!household) {
      throw new HttpError(404, `Household ${user.householdId} not found`);
    }

    const emailSender = new SesEmailSender(senderEmail);
    const result = await createInvite(inviteRepository, emailSender, {
      householdId: household.id,
      householdName: household.name,
      invitedByUserId: userId,
      invitedByEmail: email,
      frontendBaseUrl,
      rawInput: input,
    });

    logAudit({
      userId,
      action: 'household.invite.create',
      targetId: household.id,
      details: { invitedEmail: result.invitedEmail },
    });
    return jsonResponse(201, result);
  } catch (error) {
    return handleError(error);
  }
};
