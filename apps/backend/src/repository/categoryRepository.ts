import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Category } from '@household/shared';
import { ddbDocClient, getTableName } from './dynamoClient';
import { CATEGORY_SK_PREFIX, categorySk, householdPk } from './keys';

/** Repository contract, kept separate from the DynamoDB implementation so handler/service
 * logic can be unit-tested against an in-memory fake instead of real AWS. */
export interface CategoryRepository {
  listByHousehold(householdId: string): Promise<Category[]>;
  getById(householdId: string, categoryId: string): Promise<Category | undefined>;
  put(category: Category): Promise<void>;
  /** Batch-persist the preset categories seeded for a brand-new household. */
  putAll(categories: Category[]): Promise<void>;
  delete(householdId: string, categoryId: string): Promise<void>;
}

interface CategoryItem extends Category {
  PK: string;
  SK: string;
}

function toItem(category: Category): CategoryItem {
  return { ...category, PK: householdPk(category.householdId), SK: categorySk(category.id) };
}

function fromItem(item: Record<string, unknown>): Category {
  const { PK: _pk, SK: _sk, ...category } = item as unknown as CategoryItem;
  return category;
}

const BATCH_WRITE_CHUNK_SIZE = 25; // DynamoDB BatchWriteItem hard limit per request

export class DynamoCategoryRepository implements CategoryRepository {
  async listByHousehold(householdId: string): Promise<Category[]> {
    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': householdPk(householdId),
          ':skPrefix': CATEGORY_SK_PREFIX,
        },
      }),
    );
    return (result.Items ?? []).map(fromItem);
  }

  async getById(householdId: string, categoryId: string): Promise<Category | undefined> {
    const result = await ddbDocClient.send(
      new GetCommand({
        TableName: getTableName(),
        Key: { PK: householdPk(householdId), SK: categorySk(categoryId) },
      }),
    );
    return result.Item ? fromItem(result.Item) : undefined;
  }

  async put(category: Category): Promise<void> {
    await ddbDocClient.send(new PutCommand({ TableName: getTableName(), Item: toItem(category) }));
  }

  async putAll(categories: Category[]): Promise<void> {
    const tableName = getTableName();
    for (let i = 0; i < categories.length; i += BATCH_WRITE_CHUNK_SIZE) {
      const chunk = categories.slice(i, i + BATCH_WRITE_CHUNK_SIZE);
      // Sequential await keeps this simple; preset seeding is a one-time, small (~21 item)
      // write per new household, so batch parallelism isn't worth the added complexity here.
      await ddbDocClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((category) => ({ PutRequest: { Item: toItem(category) } })),
          },
        }),
      );
    }
  }

  async delete(householdId: string, categoryId: string): Promise<void> {
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: { PK: householdPk(householdId), SK: categorySk(categoryId) },
      }),
    );
  }
}
