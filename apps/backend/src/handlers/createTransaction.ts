import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { createTransactionInputSchema } from '@household/shared';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoTransactionRepository } from '../repository/transactionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { createTransaction } from '../services/transactionService';
import { getUserContext } from '../services/userService';

const repository = new DynamoTransactionRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/**
 * POST /transactions - create a transaction. Validated with createTransactionInputSchema.
 * free プランの場合、date が参照可能ウィンドウ外（直近3ヶ月より前）だと403(PLAN_RESTRICTED)。
 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const input = parseJsonBody(event.body);
    // Validate the body before the getUserContext() DynamoDB round trip, so a malformed request
    // short-circuits with 400 instead of paying for (and depending on) that call - see
    // apps/backend/src/handlers/transactions.test.ts's module doc comment.
    createTransactionInputSchema.parse(input);
    const { plan, householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const transaction = await createTransaction(repository, householdId, userId, input, plan);
    logAudit({ userId, action: 'transaction.create', targetId: transaction.id });
    return jsonResponse(201, transaction);
  } catch (error) {
    return handleError(error);
  }
};
