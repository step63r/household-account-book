import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { deleteTransaction } from '../services/transactionService';
import { getUserContext } from '../services/userService';

const repository = new DynamoTransactionRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/**
 * DELETE /transactions/{id} - delete a transaction.
 * The sort key embeds `date` (TXN#<date>#<txnId>), which isn't derivable from `id` alone, so
 * the service looks the transaction up first (Query + in-memory filter, no GSI - see
 * infra/lib/data-stack.ts) to resolve `date` before deleting. No `date` query param is
 * required from the caller.
 * free プランの場合、対象取引の date が参照可能ウィンドウ外だと403(PLAN_RESTRICTED)。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const transactionId = event.pathParameters?.id;
    if (!transactionId) {
      throw new HttpError(400, 'Missing path parameter: id');
    }
    const { plan, householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    await deleteTransaction(repository, householdId, transactionId, plan);
    logAudit({ userId, action: 'transaction.delete', targetId: transactionId });
    return jsonResponse(204);
  } catch (error) {
    return handleError(error);
  }
};
