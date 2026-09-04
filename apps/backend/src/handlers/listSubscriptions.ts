import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { handleError } from '../lib/errors';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoSubscriptionRepository } from '../repository/subscriptionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { listSubscriptions } from '../services/subscriptionService';
import { getUserContext } from '../services/userService';

const repository = new DynamoSubscriptionRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/** GET /subscriptions - list the caller's household's subscriptions. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const subscriptions = await listSubscriptions(repository, householdId);
    return jsonResponse(200, subscriptions);
  } catch (error) {
    return handleError(error);
  }
};
