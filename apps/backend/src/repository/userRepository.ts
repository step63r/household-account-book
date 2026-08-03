import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { User } from '@household/shared';
import { ddbDocClient, getTableName } from './dynamoClient';
import { PROFILE_SK, userPk } from './keys';

/** Repository contract, kept separate from the DynamoDB implementation so handler/service
 * logic can be unit-tested against an in-memory fake instead of real AWS. */
export interface UserRepository {
  getProfile(userId: string): Promise<User | undefined>;
  put(user: User): Promise<void>;
}

interface UserItem extends User {
  PK: string;
  SK: string;
}

function toItem(user: User): UserItem {
  return { ...user, PK: userPk(user.id), SK: PROFILE_SK };
}

function fromItem(item: Record<string, unknown>): User {
  const { PK: _pk, SK: _sk, ...user } = item as unknown as UserItem;
  return user;
}

export class DynamoUserRepository implements UserRepository {
  async getProfile(userId: string): Promise<User | undefined> {
    const result = await ddbDocClient.send(
      new GetCommand({
        TableName: getTableName(),
        Key: { PK: userPk(userId), SK: PROFILE_SK },
      }),
    );
    return result.Item ? fromItem(result.Item) : undefined;
  }

  async put(user: User): Promise<void> {
    await ddbDocClient.send(new PutCommand({ TableName: getTableName(), Item: toItem(user) }));
  }
}
