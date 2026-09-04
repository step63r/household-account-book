import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { createSubscriptionInputSchema } from '@household/shared';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoSubscriptionRepository } from '../repository/subscriptionRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { createSubscription } from '../services/subscriptionService';
import { getUserContext } from '../services/userService';

const repository = new DynamoSubscriptionRepository();
const userRepository = new DynamoUserRepository();
const householdRepository = new DynamoHouseholdRepository();

/** POST /subscriptions - create a household-owned subscription. Validated with createSubscriptionInputSchema. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const input = parseJsonBody(event.body);
    // Validate the body before the getUserContext() DynamoDB round trip, so a malformed request
    // short-circuits with 400 instead of paying for (and depending on) that call (see
    // createCategory.ts).
    createSubscriptionInputSchema.parse(input);
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    const subscription = await createSubscription(repository, householdId, input);
    logAudit({ userId, action: 'subscription.create', targetId: subscription.id });
    return jsonResponse(201, subscription);
  } catch (error) {
    return handleError(error);
  }
};
