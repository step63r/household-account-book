import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { updateSubscriptionInputSchema } from '@household/shared';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { HttpError, handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoSubscriptionRepository } from '../repository/subscriptionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { updateSubscription } from '../services/subscriptionService';
import { getUserContext } from '../services/userService';

const repository = new DynamoSubscriptionRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/** PUT /subscriptions/{id} - update a subscription. Validated with updateSubscriptionInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const subscriptionId = event.pathParameters?.id;
    if (!subscriptionId) {
      throw new HttpError(400, 'Missing path parameter: id');
    }
    const input = parseJsonBody(event.body);
    // Validate the body before the getUserContext() DynamoDB round trip (see createSubscription.ts).
    updateSubscriptionInputSchema.parse(input);
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const subscription = await updateSubscription(repository, householdId, subscriptionId, input);
    logAudit({ userId, action: 'subscription.update', targetId: subscription.id });
    return jsonResponse(200, subscription);
  } catch (error) {
    return handleError(error);
  }
};
