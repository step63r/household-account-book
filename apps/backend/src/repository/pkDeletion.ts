import { BatchWriteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDocClient, getTableName } from './dynamoClient';

const BATCH_WRITE_CHUNK_SIZE = 25; // DynamoDB BatchWriteItem hard limit per request

/**
 * Deletes every item under a given partition key: Query the full PK, then delete in
 * 25-item BatchWriteItem chunks. Shared by `householdRepository.ts` (deleting a whole
 * household) and `userDeletionRepository.ts` (deleting legacy un-migrated USER# data).
 * No retry loop on `UnprocessedItems` by design - surfaces the failure so the caller can
 * decide how to handle it (e.g. mark a batch candidate as failed and move on) rather than
 * looping indefinitely.
 */
export async function deleteAllItemsForPk(pk: string): Promise<number> {
  const tableName = getTableName();
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
      // this PK as failed and move on rather than looping indefinitely.
      throw new Error(
        `BatchWriteCommand left ${unprocessed.length} unprocessed delete request(s) for PK ${pk}`,
      );
    }
  }

  return keysToDelete.length;
}
