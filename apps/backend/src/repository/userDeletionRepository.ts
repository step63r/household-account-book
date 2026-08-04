import { DeleteCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { User } from '@household/shared';
import { ddbDocClient, getTableName } from './dynamoClient';
import { deleteAllItemsForPk } from './pkDeletion';
import { PROFILE_SK, userPk } from './keys';

/**
 * Repository contract for the withdrawal physical-deletion batch. Kept separate from
 * `userRepository.ts` (single-item PROFILE CRUD) because this repository operates across
 * the withdrawal-candidate lookup plus the two possible deletion paths: a migrated user
 * (household membership removed, USER# PROFILE deleted) and a legacy un-migrated user
 * (fallback full-PK delete under USER#<userId>, same as before households existed).
 */
export interface UserDeletionRepository {
  /** Users past the withdrawal grace period, whose data should be physically deleted. */
  findCandidates(nowIso: string): Promise<{ userId: string; deletionScheduledAt: string }[]>;
  /** Reads the user's householdId from USER#<userId>/PROFILE, if migrated. */
  getUserHouseholdId(userId: string): Promise<string | undefined>;
  /** Deletes just the USER#<userId>/PROFILE item. */
  deleteUserProfile(userId: string): Promise<void>;
  /** Fallback for un-migrated legacy data (no householdId yet): deletes every item still
   * living directly under USER#<userId> (PROFILE/TXN/CATEGORY/BUDGET). Returns the count deleted. */
  deleteAllLegacyItems(userId: string): Promise<number>;
}

/**
 * PK format is `USER#<userId>` (see keys.ts) - strip the prefix back out to the bare userId.
 */
function userIdFromPk(pk: string): string {
  return pk.startsWith('USER#') ? pk.slice('USER#'.length) : pk;
}

export class DynamoUserDeletionRepository implements UserDeletionRepository {
  async findCandidates(nowIso: string): Promise<{ userId: string; deletionScheduledAt: string }[]> {
    const tableName = getTableName();
    const candidates: { userId: string; deletionScheduledAt: string }[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      // Deliberate exception to the repo's "Query only, never Scan" rule: candidate lookup
      // needs to filter on status + deletionScheduledAt, which the single-table PK/SK design
      // can't express as a Query. This batch runs at most once a day and the household-scale
      // user count keeps a full-table Scan cheap. All three FilterExpression conditions below
      // are required - relaxing any one of them (SK, status, or the deletionScheduledAt cutoff)
      // would widen the scan to unrelated items or users who haven't reached their grace
      // period yet, risking deletion of live user data. Do not loosen this filter.
      const result = await ddbDocClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression:
            'SK = :profileSk AND #status = :pendingDeletion AND deletionScheduledAt <= :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':profileSk': PROFILE_SK,
            ':pendingDeletion': 'pendingDeletion',
            ':now': nowIso,
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      for (const item of result.Items ?? []) {
        // Only USER#<userId>/PROFILE items match this filter (HOUSEHOLD#/INVITE# partitions
        // never carry a `status` attribute), so every match here is safe to treat as a user.
        candidates.push({
          userId: userIdFromPk(item.PK as string),
          deletionScheduledAt: item.deletionScheduledAt as string,
        });
      }

      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    return candidates;
  }

  async getUserHouseholdId(userId: string): Promise<string | undefined> {
    const result = await ddbDocClient.send(
      new GetCommand({
        TableName: getTableName(),
        Key: { PK: userPk(userId), SK: PROFILE_SK },
      }),
    );
    return (result.Item as User | undefined)?.householdId;
  }

  async deleteUserProfile(userId: string): Promise<void> {
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: { PK: userPk(userId), SK: PROFILE_SK },
      }),
    );
  }

  async deleteAllLegacyItems(userId: string): Promise<number> {
    return deleteAllItemsForPk(userPk(userId));
  }
}
