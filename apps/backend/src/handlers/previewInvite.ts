import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoInviteRepository } from '../repository/inviteRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { previewInvite } from '../services/householdService';

const householdRepository = new DynamoHouseholdRepository();
const userRepository = new DynamoUserRepository();
const inviteRepository = new DynamoInviteRepository();

/**
 * GET /invites/{token} - 未認証。招待トークン保持者向けのプレビュー（世帯名・招待元/先メール・
 * 有効期限のみ）を返す。このルートには認可（JWT authorizer）が付いていない前提のため、
 * requireUserId()/requireEmail() は使わない - event.requestContext.authorizer の存在を仮定しない。
 * 読み取り専用のため監査ログなし。
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const token = event.pathParameters?.token;
    const preview = await previewInvite(
      inviteRepository,
      householdRepository,
      userRepository,
      token,
    );
    return jsonResponse(200, preview);
  } catch (error) {
    return handleError(error);
  }
};
