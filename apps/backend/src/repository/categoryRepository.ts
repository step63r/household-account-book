import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Category } from '@household/shared';
import { ddbDocClient, getTableName } from './dynamoClient';
import { CATEGORY_SK_PREFIX, categorySk, userPk } from './keys';

/** Repository contract, kept separate from the DynamoDB implementation so handler/service
 * logic can be unit-tested against an in-memory fake instead of real AWS. */
export interface CategoryRepository {
  listByUser(userId: string): Promise<Category[]>;
  getById(userId: string, categoryId: string): Promise<Category | undefined>;
  put(category: Category): Promise<void>;
  /** Batch-persist the preset categories seeded for a brand-new user. */
  putAll(categories: Category[]): Promise<void>;
  delete(userId: string, categoryId: string): Promise<void>;
}

interface CategoryItem extends Category {
  PK: string;
  SK: string;
}

function toItem(category: Category): CategoryItem {
  return { ...category, PK: userPk(category.userId), SK: categorySk(category.id) };
}

function fromItem(item: Record<string, unknown>): Category {
  const { PK: _pk, SK: _sk, ...category } = item as unknown as CategoryItem;
  return category;
}

const BATCH_WRITE_CHUNK_SIZE = 25; // DynamoDB BatchWriteItem hard limit per request

export class DynamoCategoryRepository implements CategoryRepository {
  async listByUser(userId: string): Promise<Category[]> {
    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': userPk(userId),
          ':skPrefix': CATEGORY_SK_PREFIX,
        },
      }),
    );
    return (result.Items ?? []).map(fromItem);
  }

  async getById(userId: string, categoryId: string): Promise<Category | undefined> {
    const result = await ddbDocClient.send(
      new GetCommand({
        TableName: getTableName(),
        Key: { PK: userPk(userId), SK: categorySk(categoryId) },
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
      // write per new user, so batch parallelism isn't worth the added complexity here.
      await ddbDocClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: chunk.map((category) => ({ PutRequest: { Item: toItem(category) } })),
          },
        }),
      );
    }
  }

  async delete(userId: string, categoryId: string): Promise<void> {
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: { PK: userPk(userId), SK: categorySk(categoryId) },
      }),
    );
  }
}
