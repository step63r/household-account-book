import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Subscription } from '@household/shared';
import { ddbDocClient, getTableName } from './dynamoClient';
import { householdPk, SUBSCRIPTION_SK_PREFIX, subscriptionSk } from './keys';

/** Repository contract, kept separate from the DynamoDB implementation so handler/service
 * logic can be unit-tested against an in-memory fake instead of real AWS. */
export interface SubscriptionRepository {
  listByHousehold(householdId: string): Promise<Subscription[]>;
  getById(householdId: string, subscriptionId: string): Promise<Subscription | undefined>;
  put(subscription: Subscription): Promise<void>;
  /** Batch-persist a full reordered set of subscriptions. */
  putAll(subscriptions: Subscription[]): Promise<void>;
  delete(householdId: string, subscriptionId: string): Promise<void>;
}

interface SubscriptionItem extends Subscription {
  PK: string;
  SK: string;
}

function toItem(subscription: Subscription): SubscriptionItem {
  return {
    ...subscription,
    PK: householdPk(subscription.householdId),
    SK: subscriptionSk(subscription.id),
  };
}

function fromItem(item: Record<string, unknown>): Subscription {
  const { PK: _pk, SK: _sk, ...subscription } = item as unknown as SubscriptionItem;
  return subscription;
}

const BATCH_WRITE_CHUNK_SIZE = 25; // DynamoDB BatchWriteItem hard limit per request

export class DynamoSubscriptionRepository implements SubscriptionRepository {
  async listByHousehold(householdId: string): Promise<Subscription[]> {
    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': householdPk(householdId),
          ':skPrefix': SUBSCRIPTION_SK_PREFIX,
        },
      }),
    );
    return (result.Items ?? []).map(fromItem);
  }

  async getById(householdId: string, subscriptionId: string): Promise<Subscription | undefined> {
    const result = await ddbDocClient.send(
      new GetCommand({
        TableName: getTableName(),
        Key: { PK: householdPk(householdId), SK: subscriptionSk(subscriptionId) },
      }),
    );
    return result.Item ? fromItem(result.Item) : undefined;
  }

  async put(subscription: Subscription): Promise<void> {
    await ddbDocClient.send(
      new PutCommand({ TableName: getTableName(), Item: toItem(subscription) }),
    );
  }

  async putAll(subscriptions: Subscription[]): Promise<void> {
    const tableName = getTableName();
    for (let i = 0; i < subscriptions.length; i += BATCH_WRITE_CHUNK_SIZE) {
      const chunk = subscriptions.slice(i, i + BATCH_WRITE_CHUNK_SIZE);
      // Sequential await keeps this simple; reordering is a small, infrequent write per
      // household, so batch parallelism isn't worth the added complexity here.
      await ddbDocClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((subscription) => ({
              PutRequest: { Item: toItem(subscription) },
            })),
          },
        }),
      );
    }
  }

  async delete(householdId: string, subscriptionId: string): Promise<void> {
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: { PK: householdPk(householdId), SK: subscriptionSk(subscriptionId) },
      }),
    );
  }
}
