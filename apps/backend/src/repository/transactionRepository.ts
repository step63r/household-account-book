import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Transaction } from '@household/shared';
import { ddbDocClient, getTableName } from './dynamoClient';
import { TRANSACTION_SK_PREFIX, transactionSk, householdPk } from './keys';

/** Inclusive date range (YYYY-MM-DD) to scope a transaction list Query. */
export interface TransactionListRange {
  from?: string;
  to?: string;
}

/** Repository contract, kept separate from the DynamoDB implementation so handler/service
 * logic can be unit-tested against an in-memory fake instead of real AWS. */
export interface TransactionRepository {
  listByHousehold(householdId: string, range?: TransactionListRange): Promise<Transaction[]>;
  getById(householdId: string, transactionId: string): Promise<Transaction | undefined>;
  put(transaction: Transaction): Promise<void>;
  /** `date` is required because it's part of the sort key and can't be derived from id alone. */
  delete(householdId: string, date: string, transactionId: string): Promise<void>;
}

interface TransactionItem extends Transaction {
  PK: string;
  SK: string;
}

function toItem(transaction: Transaction): TransactionItem {
  return {
    ...transaction,
    PK: householdPk(transaction.householdId),
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
const SK_UPPER_BOUND_SUFFIX = '￿';

export class DynamoTransactionRepository implements TransactionRepository {
  async listByHousehold(householdId: string, range?: TransactionListRange): Promise<Transaction[]> {
    const pk = householdPk(householdId);
    const from = range?.from;
    const to = range?.to;

    let keyCondition: string;
    const values: Record<string, string> = { ':pk': pk };

    if (from && to) {
      keyCondition = 'PK = :pk AND SK BETWEEN :skFrom AND :skTo';
      values[':skFrom'] = transactionSk(from, '');
      values[':skTo'] = transactionSk(to, '') + SK_UPPER_BOUND_SUFFIX;
    } else if (from) {
      // Lower bound alone is safe without a prefix guard: every other SK prefix in this
      // partition (PROFILE, CATEGORY#, BUDGET#) sorts below "TXN#", so ">= TXN#..." can
      // never include a non-transaction item.
      keyCondition = 'PK = :pk AND SK >= :skFrom';
      values[':skFrom'] = transactionSk(from, '');
    } else if (to) {
      // Unlike the `from`-only case, an upper bound alone (`SK <= :skTo`) would also match
      // PROFILE/CATEGORY#/BUDGET# items, since they sort below "TXN#". Anchor the lower bound
      // at the transaction prefix itself to keep this a KeyConditionExpression-only query -
      // DynamoDB disallows filtering on key attributes, so this can't be done via
      // FilterExpression (that previously threw a ValidationException here).
      keyCondition = 'PK = :pk AND SK BETWEEN :skPrefix AND :skTo';
      values[':skPrefix'] = TRANSACTION_SK_PREFIX;
      values[':skTo'] = transactionSk(to, '') + SK_UPPER_BOUND_SUFFIX;
    } else {
      keyCondition = 'PK = :pk AND begins_with(SK, :skPrefix)';
      values[':skPrefix'] = TRANSACTION_SK_PREFIX;
    }

    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: values,
      }),
    );
    return (result.Items ?? []).map(fromItem);
  }

  async getById(householdId: string, transactionId: string): Promise<Transaction | undefined> {
    // The sort key embeds `date`, which isn't known from `transactionId` alone, so a direct
    // GetCommand isn't possible. Query the household's full TXN# range and filter in memory
    // instead of adding a GSI - see infra/lib/data-stack.ts for the "no GSI until a concrete
    // pattern needs one" policy this follows.
    const transactions = await this.listByHousehold(householdId);
    return transactions.find((transaction) => transaction.id === transactionId);
  }

  async put(transaction: Transaction): Promise<void> {
    await ddbDocClient.send(
      new PutCommand({ TableName: getTableName(), Item: toItem(transaction) }),
    );
  }

  async delete(householdId: string, date: string, transactionId: string): Promise<void> {
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: { PK: householdPk(householdId), SK: transactionSk(date, transactionId) },
      }),
    );
  }
}
