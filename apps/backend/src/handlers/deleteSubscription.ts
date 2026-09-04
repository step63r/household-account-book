import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoSubscriptionRepository } from '../repository/subscriptionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { deleteSubscription } from '../services/subscriptionService';
import { getUserContext } from '../services/userService';

const repository = new DynamoSubscriptionRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/** DELETE /subscriptions/{id} - delete a subscription. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const subscriptionId = event.pathParameters?.id;
    if (!subscriptionId) {
      throw new HttpError(400, 'Missing path parameter: id');
    }
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    await deleteSubscription(repository, householdId, subscriptionId);
    logAudit({ userId, action: 'subscription.delete', targetId: subscriptionId });
    return jsonResponse(204);
  } catch (error) {
    return handleError(error);
  }
};
