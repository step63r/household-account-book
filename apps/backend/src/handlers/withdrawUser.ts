import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoUserRepository } from '../repository/userRepository';
import { requestWithdrawal } from '../services/userService';

const repository = new DynamoUserRepository();

/**
 * POST /users/me/withdraw - 退会申請（論理削除）。
 * status を pendingDeletion にし、deletionScheduledAt（30日後）を記録する。実際の
 * DynamoDB項目の物理削除は別バッチ（未実装 - CLAUDE.mdの既知ギャップ）が担う。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const user = await requestWithdrawal(repository, userId, email);
    logAudit({ userId, action: 'user.withdraw', targetId: userId });
    return jsonResponse(200, user);
  } catch (error) {
    return handleError(error);
  }
};
