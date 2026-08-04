import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { requireEmail, requireUserId } from '../lib/auth';
import { logAudit } from '../lib/audit';
import { handleError } from '../lib/errors';
import { parseJsonBody } from '../lib/parseBody';
import { jsonResponse } from '../lib/response';
import { DynamoHouseholdRepository } from '../repository/householdRepository';
import { DynamoUserRepository } from '../repository/userRepository';
import { getMyHousehold, updateHouseholdName } from '../services/householdService';
import { getUserContext } from '../services/userService';

const householdRepository = new DynamoHouseholdRepository();
const userRepository = new DynamoUserRepository();

/** PATCH /households/me - 世帯名を更新する。レスポンスはGET /households/meと同じHouseholdSummary形。 */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const userId = requireUserId(event);
    const email = requireEmail(event);
    const input = parseJsonBody(event.body);
    const { householdId } = await getUserContext(
      userRepository,
      householdRepository,
      userId,
      email,
    );
    await updateHouseholdName(householdRepository, householdId, input);
    logAudit({ userId, action: 'household.update', targetId: householdId });
    const household = await getMyHousehold(householdRepository, userRepository, householdId);
    return jsonResponse(200, household);
  } catch (error) {
    return handleError(error);
  }
};
