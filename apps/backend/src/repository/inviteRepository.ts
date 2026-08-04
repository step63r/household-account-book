import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Invite } from '@household/shared';
import { ddbDocClient, getTableName } from './dynamoClient';
import { INVITE_SK, invitePk } from './keys';

/** Repository contract, kept separate from the DynamoDB implementation so handler/service
 * logic can be unit-tested against an in-memory fake instead of real AWS. */
export interface InviteRepository {
  get(token: string): Promise<Invite | undefined>;
  put(invite: Invite): Promise<void>;
  delete(token: string): Promise<void>;
}

interface InviteItem extends Invite {
  PK: string;
  SK: string;
  /** DynamoDB TTL housekeeping attribute (epoch seconds), NOT part of the Invite domain type.
   * DynamoDB TTL deletion can lag up to ~48h, so `householdService` always re-checks
   * `expiresAt <= now` explicitly rather than trusting item-absence to mean "not expired". */
  ttl: number;
}

function toItem(invite: Invite): InviteItem {
  return {
    ...invite,
    PK: invitePk(invite.token),
    SK: INVITE_SK,
    ttl: Math.floor(new Date(invite.expiresAt).getTime() / 1000),
  };
}

function fromItem(item: Record<string, unknown>): Invite {
  const { PK: _pk, SK: _sk, ttl: _ttl, ...invite } = item as unknown as InviteItem;
  return invite;
}

export class DynamoInviteRepository implements InviteRepository {
  async get(token: string): Promise<Invite | undefined> {
    const result = await ddbDocClient.send(
      new GetCommand({
        TableName: getTableName(),
        Key: { PK: invitePk(token), SK: INVITE_SK },
      }),
    );
    return result.Item ? fromItem(result.Item) : undefined;
  }

  async put(invite: Invite): Promise<void> {
    await ddbDocClient.send(new PutCommand({ TableName: getTableName(), Item: toItem(invite) }));
  }

  async delete(token: string): Promise<void> {
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: { PK: invitePk(token), SK: INVITE_SK },
      }),
    );
  }
}
