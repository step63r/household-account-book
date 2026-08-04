import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Household, HouseholdMember } from '@household/shared';
import { ddbDocClient, getTableName } from './dynamoClient';
import { deleteAllItemsForPk } from './pkDeletion';
import {
  BUDGET_SK_PREFIX,
  MEMBER_SK_PREFIX,
  PROFILE_SK,
  TRANSACTION_SK_PREFIX,
  householdPk,
  memberSk,
} from './keys';

/** Repository contract, kept separate from the DynamoDB implementation so handler/service
 * logic can be unit-tested against an in-memory fake instead of real AWS. */
export interface HouseholdRepository {
  getProfile(householdId: string): Promise<Household | undefined>;
  putProfile(household: Household): Promise<void>;
  listMembers(householdId: string): Promise<HouseholdMember[]>;
  putMember(member: HouseholdMember): Promise<void>;
  deleteMember(householdId: string, userId: string): Promise<void>;
  /** True iff the household has no TXN#/BUDGET# items yet (CATEGORY# items - unused preset
   * copies - don't count as real user data, see householdService.acceptInvite). */
  isFresh(householdId: string): Promise<boolean>;
  /** Deletes every item under the household's partition key (PROFILE/MEMBER#/TXN#/CATEGORY#/BUDGET#). */
  deleteAllItems(householdId: string): Promise<number>;
}

interface HouseholdItem extends Household {
  PK: string;
  SK: string;
}

interface HouseholdMemberItem extends HouseholdMember {
  PK: string;
  SK: string;
}

function toProfileItem(household: Household): HouseholdItem {
  return { ...household, PK: householdPk(household.id), SK: PROFILE_SK };
}

function fromProfileItem(item: Record<string, unknown>): Household {
  const { PK: _pk, SK: _sk, ...household } = item as unknown as HouseholdItem;
  return household;
}

function toMemberItem(member: HouseholdMember): HouseholdMemberItem {
  return { ...member, PK: householdPk(member.householdId), SK: memberSk(member.userId) };
}

function fromMemberItem(item: Record<string, unknown>): HouseholdMember {
  const { PK: _pk, SK: _sk, ...member } = item as unknown as HouseholdMemberItem;
  return member;
}

export class DynamoHouseholdRepository implements HouseholdRepository {
  async getProfile(householdId: string): Promise<Household | undefined> {
    const result = await ddbDocClient.send(
      new GetCommand({
        TableName: getTableName(),
        Key: { PK: householdPk(householdId), SK: PROFILE_SK },
      }),
    );
    return result.Item ? fromProfileItem(result.Item) : undefined;
  }

  async putProfile(household: Household): Promise<void> {
    await ddbDocClient.send(
      new PutCommand({ TableName: getTableName(), Item: toProfileItem(household) }),
    );
  }

  async listMembers(householdId: string): Promise<HouseholdMember[]> {
    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': householdPk(householdId),
          ':skPrefix': MEMBER_SK_PREFIX,
        },
      }),
    );
    return (result.Items ?? []).map(fromMemberItem);
  }

  async putMember(member: HouseholdMember): Promise<void> {
    await ddbDocClient.send(
      new PutCommand({ TableName: getTableName(), Item: toMemberItem(member) }),
    );
  }

  async deleteMember(householdId: string, userId: string): Promise<void> {
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: { PK: householdPk(householdId), SK: memberSk(userId) },
      }),
    );
  }

  async isFresh(householdId: string): Promise<boolean> {
    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': householdPk(householdId) },
      }),
    );
    return (result.Items ?? []).every((item) => {
      const sk = item.SK as string;
      return !sk.startsWith(TRANSACTION_SK_PREFIX) && !sk.startsWith(BUDGET_SK_PREFIX);
    });
  }

  async deleteAllItems(householdId: string): Promise<number> {
    return deleteAllItemsForPk(householdPk(householdId));
  }
}
