import { BatchWriteCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { User } from '@household/shared';
import { ddbDocClient, getTableName } from './dynamoClient';
import { PROFILE_SK, userPk } from './keys';

const BATCH_WRITE_CHUNK_SIZE = 25; // DynamoDB BatchWriteItem hard limit per request

/**
 * Repository contract for the one-off `scripts/migrateUsersToHouseholds.ts` script (see
 * `src/migration/migrateUsersToHouseholds.ts` for the algorithm that uses it). Kept separate
 * from the request-handling repositories (userRepository.ts etc.) because this operates on
 * raw, untyped items: old TXN#/CATEGORY#/BUDGET# items still on disk from before this feature
 * carry the pre-household `userId` attribute name (the domain types were renamed to
 * `householdId` in code, but nothing rewrites already-persisted items until this script runs),
 * so this repository intentionally works with `Record<string, unknown>` instead of the typed
 * Transaction/Category/Budget shapes.
 */
export interface MigrationRepository {
  /** Scan for USER#<userId>/PROFILE items lacking householdId - same explicitly-approved
   * one-off Scan exception as userDeletionRepository.findCandidates (this script is run once,
   * manually, from a local machine - never scheduled or deployed). */
  findUnmigratedUserIds(): Promise<string[]>;
  /** Query the full USER#<userId> partition (PROFILE + TXN#/CATEGORY#/BUDGET# items), raw
   * (PK/SK included) so the migration can inspect SK prefixes and old attribute names. */
  queryUserPartition(userId: string): Promise<Record<string, unknown>[]>;
  /** Batch-put arbitrary already PK/SK-shaped items (chunked into BatchWriteItem requests). */
  batchPutItems(items: Record<string, unknown>[]): Promise<void>;
  /** Commits the migration for one user: overwrites USER#<userId>/PROFILE in place. This is
   * the migration's single point-of-no-return. */
  putUserProfile(user: User): Promise<void>;
  /** Best-effort batch-delete of old USER#<userId> child items (chunked internally). Throws
   * on any unprocessed delete request so the caller can catch-and-log without retrying. */
  batchDeleteItems(keys: { PK: string; SK: string }[]): Promise<void>;
}

function userIdFromPk(pk: string): string {
  return pk.startsWith('USER#') ? pk.slice('USER#'.length) : pk;
}

export class DynamoMigrationRepository implements MigrationRepository {
  async findUnmigratedUserIds(): Promise<string[]> {
    const tableName = getTableName();
    const userIds: string[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      // Deliberate exception to the repo's "Query only, never Scan" rule - see
      // userDeletionRepository.findCandidates for the identical rationale. This is a one-off,
      // manually-run script (never scheduled/deployed), so the Scan cost is a non-issue.
      const result = await ddbDocClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: 'SK = :profileSk AND attribute_not_exists(householdId)',
          ExpressionAttributeValues: { ':profileSk': PROFILE_SK },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      for (const item of result.Items ?? []) {
        const pk = item.PK as string;
        // USER#<userId>/PROFILE is the only shape this filter can match (HOUSEHOLD#/INVITE#
        // partitions never carry a `status`/`plan`-style PROFILE-only attribute set, but even
        // so, guard explicitly rather than assume).
        if (pk.startsWith('USER#')) {
          userIds.push(userIdFromPk(pk));
        }
      }

      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    return userIds;
  }

  async queryUserPartition(userId: string): Promise<Record<string, unknown>[]> {
    const tableName = getTableName();
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const result = await ddbDocClient.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': userPk(userId) },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      items.push(...(result.Items ?? []));
      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    return items;
  }

  async batchPutItems(items: Record<string, unknown>[]): Promise<void> {
    const tableName = getTableName();
    for (let i = 0; i < items.length; i += BATCH_WRITE_CHUNK_SIZE) {
      const chunk = items.slice(i, i + BATCH_WRITE_CHUNK_SIZE);
      const response = await ddbDocClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((item) => ({ PutRequest: { Item: item } })),
          },
        }),
      );
      const unprocessed = response.UnprocessedItems?.[tableName];
      if (unprocessed && unprocessed.length > 0) {
        throw new Error(
          `BatchWriteCommand left ${unprocessed.length} unprocessed put request(s) during migration copy phase`,
        );
      }
    }
  }

  async putUserProfile(user: User): Promise<void> {
    await ddbDocClient.send(
      new PutCommand({
        TableName: getTableName(),
        Item: { ...user, PK: userPk(user.id), SK: PROFILE_SK },
      }),
    );
  }

  async batchDeleteItems(keys: { PK: string; SK: string }[]): Promise<void> {
    const tableName = getTableName();
    for (let i = 0; i < keys.length; i += BATCH_WRITE_CHUNK_SIZE) {
      const chunk = keys.slice(i, i + BATCH_WRITE_CHUNK_SIZE);
      const response = await ddbDocClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((key) => ({ DeleteRequest: { Key: key } })),
          },
        }),
      );
      const unprocessed = response.UnprocessedItems?.[tableName];
      if (unprocessed && unprocessed.length > 0) {
        throw new Error(
          `BatchWriteCommand left ${unprocessed.length} unprocessed delete request(s) during migration cleanup phase`,
        );
      }
    }
  }
}
