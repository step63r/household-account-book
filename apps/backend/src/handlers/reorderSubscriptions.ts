import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { reorderSubscriptionsInputSchema } from '@household/shared';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoSubscriptionRepository } from '../repository/subscriptionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { reorderSubscriptions } from '../services/subscriptionService';
import { getUserContext } from '../services/userService';

const repository = new DynamoSubscriptionRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/** PUT /subscriptions/reorder - reorder the household's subscriptions. Validated with reorderSubscriptionsInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const input = parseJsonBody(event.body);
    // Validate the body before the getUserContext() DynamoDB round trip (see updateSubscription.ts).
    reorderSubscriptionsInputSchema.parse(input);
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const subscriptions = await reorderSubscriptions(repository, householdId, input);
    logAudit({ userId, action: 'subscription.reorder', targetId: 'household' });
    return jsonResponse(200, subscriptions);
  } catch (error) {
    return handleError(error);
  }
};
