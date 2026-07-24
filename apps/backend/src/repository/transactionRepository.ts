import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Transaction } from '@household/shared';
import { ddbDocClient, getTableName } from './dynamoClient';
import { TRANSACTION_SK_PREFIX, transactionSk, userPk } from './keys';

/** Inclusive date range (YYYY-MM-DD) to scope a transaction list Query. */
export interface TransactionListRange {
  from?: string;
  to?: string;
}

/** Repository contract, kept separate from the DynamoDB implementation so handler/service
 * logic can be unit-tested against an in-memory fake instead of real AWS. */
export interface TransactionRepository {
  listByUser(userId: string, range?: TransactionListRange): Promise<Transaction[]>;
  getById(userId: string, transactionId: string): Promise<Transaction | undefined>;
  put(transaction: Transaction): Promise<void>;
  /** `date` is required because it's part of the sort key and can't be derived from id alone. */
  delete(userId: string, date: string, transactionId: string): Promise<void>;
}

interface TransactionItem extends Transaction {
  PK: string;
  SK: string;
}

function toItem(transaction: Transaction): TransactionItem {
  return {
    ...transaction,
    PK: userPk(transaction.userId),
    SK: transactionSk(transaction.date, transaction.id),
  };
}

function fromItem(item: Record<string, unknown>): Transaction {
  const { PK: _pk, SK: _sk, ...transaction } = item as unknown as TransactionItem;
  return transaction;
}

/** Sorts higher than any real sort key sharing the same TXN#<date># prefix, so appending it
 * to a date-only prefix turns an inclusive upper bound into a range that covers every
 * transaction id recorded on that date. */
const SK_UPPER_BOUND_SUFFIX = '\uFFFF';

export class DynamoTransactionRepository implements TransactionRepository {
  async listByUser(userId: string, range?: TransactionListRange): Promise<Transaction[]> {
    const pk = userPk(userId);
    const from = range?.from;
    const to = range?.to;

    let keyCondition: string;
    const values: Record<string, string> = { ':pk': pk };
    const isRangeBound = Boolean(from || to);

    if (from && to) {
      keyCondition = 'PK = :pk AND SK BETWEEN :skFrom AND :skTo';
      values[':skFrom'] = transactionSk(from, '');
      values[':skTo'] = transactionSk(to, '') + SK_UPPER_BOUND_SUFFIX;
    } else if (from) {
      keyCondition = 'PK = :pk AND SK >= :skFrom';
      values[':skFrom'] = transactionSk(from, '');
    } else if (to) {
      keyCondition = 'PK = :pk AND SK <= :skTo';
      values[':skTo'] = transactionSk(to, '') + SK_UPPER_BOUND_SUFFIX;
    } else {
      keyCondition = 'PK = :pk AND begins_with(SK, :skPrefix)';
      values[':skPrefix'] = TRANSACTION_SK_PREFIX;
    }

    // Defense-in-depth for the range-bound branches: an open-ended SK comparison could in
    // principle include a non-transaction item if a future SK prefix sorted after "TXN#".
    if (isRangeBound) {
      values[':skPrefix'] = TRANSACTION_SK_PREFIX;
    }

    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: keyCondition,
        FilterExpression: isRangeBound ? 'begins_with(SK, :skPrefix)' : undefined,
        ExpressionAttributeValues: values,
      }),
    );
    return (result.Items ?? []).map(fromItem);
  }

  async getById(userId: string, transactionId: string): Promise<Transaction | undefined> {
    // The sort key embeds `date`, which isn't known from `transactionId` alone, so a direct
    // GetCommand isn't possible. Query the user's full TXN# range and filter in memory instead
    // of adding a GSI - see infra/lib/data-stack.ts for the "no GSI until a concrete pattern
    // needs one" policy this follows.
    const transactions = await this.listByUser(userId);
    return transactions.find((transaction) => transaction.id === transactionId);
  }

  async put(transaction: Transaction): Promise<void> {
    await ddbDocClient.send(
      new PutCommand({ TableName: getTableName(), Item: toItem(transaction) }),
    );
  }

  async delete(userId: string, date: string, transactionId: string): Promise<void> {
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: { PK: userPk(userId), SK: transactionSk(date, transactionId) },
      }),
    );
  }
}
