import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoUserRepository } from '../repository/userRepository';
import { recordConsent } from '../services/userService';

const repository = new DynamoUserRepository();

/**
 * POST /users/me/consent - 利用規約・プライバシーポリシー（結合バージョン）への同意を記録する。
 * バージョンはボディで受け取らず、常にサーバー側の CURRENT_TERMS_VERSION をスタンプする
 * （古いフロントのバンドルが誤って古いバージョンに同意させてしまう事故を防ぐため）。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const status = await recordConsent(repository, userId, email);
    logAudit({ userId, action: 'user.consent', targetId: userId, details: { version: status.termsAgreedVersion } });
    return jsonResponse(200, status);
  } catch (error) {
    return handleError(error);
  }
};
