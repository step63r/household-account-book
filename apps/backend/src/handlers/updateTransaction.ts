import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { updateTransactionInputSchema } from '@household/shared';
import { requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { updateTransaction } from '../services/transactionService';
import { getUserPlan } from '../services/userService';

const repository = new DynamoTransactionRepository();
const userRepository = new DynamoUserRepository();

/**
 * PUT /transactions/{id} - update a transaction. Validated with updateTransactionInputSchema.
 * free プランの場合、既存/更新後いずれかの date が参照可能ウィンドウ外だと403(PLAN_RESTRICTED)。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const transactionId = event.pathParameters?.id;
    if (!transactionId) {
      throw new HttpError(400, 'Missing path parameter: id');
    }
    const input = parseJsonBody(event.body);
    // Validate the body before the getUserPlan() DynamoDB round trip (see createTransaction.ts).
    updateTransactionInputSchema.parse(input);
    const plan = await getUserPlan(userRepository, userId);
    const transaction = await updateTransaction(repository, userId, transactionId, input, plan);
    logAudit({ userId, action: 'transaction.update', targetId: transaction.id });
    return jsonResponse(200, transaction);
  } catch (error) {
    return handleError(error);
  }
};
