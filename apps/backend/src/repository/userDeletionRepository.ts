import { BatchWriteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient, getTableName } from './dynamoClient';
import { PROFILE_SK } from './keys';

/**
 * Repository contract for the withdrawal physical-deletion batch. Kept separate from
 * `userRepository.ts` (single-item PROFILE CRUD) because this repository operates across
 * every item type owned by a user (PROFILE/TXN/CATEGORY/BUDGET), which is a different
 * concern from the per-item repositories used by the request-handling path.
 */
export interface UserDeletionRepository {
  /** Users past the withdrawal grace period, whose data should be physically deleted. */
  findCandidates(nowIso: string): Promise<{ userId: string; deletionScheduledAt: string }[]>;
  /** Deletes every item owned by the user (PROFILE/TXN/CATEGORY/BUDGET). Returns the count deleted. */
  deleteAllItemsForUser(userId: string): Promise<number>;
}

const BATCH_WRITE_CHUNK_SIZE = 25; // DynamoDB BatchWriteItem hard limit per request

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
          FilterExpression: 'SK = :profileSk AND #status = :pendingDeletion AND deletionScheduledAt <= :now',
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
        candidates.push({
          userId: userIdFromPk(item.PK as string),
          deletionScheduledAt: item.deletionScheduledAt as string,
        });
      }

      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    return candidates;
  }

  async deleteAllItemsForUser(userId: string): Promise<number> {
    const tableName = getTableName();
    const pk = `USER#${userId}`;
    const keysToDelete: { PK: string; SK: string }[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const result = await ddbDocClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': pk },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      for (const item of result.Items ?? []) {
        keysToDelete.push({ PK: item.PK as string, SK: item.SK as string });
      }

      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    for (let i = 0; i < keysToDelete.length; i += BATCH_WRITE_CHUNK_SIZE) {
      const chunk = keysToDelete.slice(i, i + BATCH_WRITE_CHUNK_SIZE);
      const response = await ddbDocClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((key) => ({ DeleteRequest: { Key: key } })),
          },
        }),
      );

      const unprocessed = response.UnprocessedItems?.[tableName];
      if (unprocessed && unprocessed.length > 0) {
        // No retry loop by design (see plan): surface the failure so the caller can mark
        // this user as failed and move on rather than looping indefinitely.
        throw new Error(
          `BatchWriteCommand left ${unprocessed.length} unprocessed delete request(s) for user ${userId}`,
        );
      }
    }

    return keysToDelete.length;
  }
}
