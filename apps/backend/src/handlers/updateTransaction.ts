import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { updateTransactionInputSchema } from '@household/shared';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { updateTransaction } from '../services/transactionService';
import { getUserContext } from '../services/userService';

const repository = new DynamoTransactionRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/**
 * PUT /transactions/{id} - update a transaction. Validated with updateTransactionInputSchema.
 * free プランの場合、既存/更新後いずれかの date が参照可能ウィンドウ外だと403(PLAN_RESTRICTED)。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const transactionId = event.pathParameters?.id;
    if (!transactionId) {
      throw new HttpError(400, 'Missing path parameter: id');
    }
    const input = parseJsonBody(event.body);
    // Validate the body before the getUserContext() DynamoDB round trip (see createTransaction.ts).
    updateTransactionInputSchema.parse(input);
    const { plan, householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const transaction = await updateTransaction(
      repository,
      householdId,
      transactionId,
      input,
      plan,
    );
    logAudit({ userId, action: 'transaction.update', targetId: transaction.id });
    return jsonResponse(200, transaction);
  } catch (error) {
    return handleError(error);
  }
};
