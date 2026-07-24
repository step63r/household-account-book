import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Budget } from '@household/shared';
import { ddbDocClient, getTableName } from './dynamoClient';
import { BUDGET_SK_PREFIX, budgetSk, userPk } from './keys';

/** Repository contract, kept separate from the DynamoDB implementation so handler/service
 * logic can be unit-tested against an in-memory fake instead of real AWS. */
export interface BudgetRepository {
  listByUserAndMonth(userId: string, yearMonth: string): Promise<Budget[]>;
  /** Create-or-replace; the sort key (yearMonth + categoryId) makes this naturally idempotent
   * (see handlers/upsertBudget.ts), so no separate get-before-write lookup is needed. */
  put(budget: Budget): Promise<void>;
}

interface BudgetItem extends Budget {
  PK: string;
  SK: string;
}

function toItem(budget: Budget): BudgetItem {
  return { ...budget, PK: userPk(budget.userId), SK: budgetSk(budget.yearMonth, budget.categoryId) };
}

function fromItem(item: Record<string, unknown>): Budget {
  const { PK: _pk, SK: _sk, ...budget } = item as unknown as BudgetItem;
  return budget;
}

export class DynamoBudgetRepository implements BudgetRepository {
  async listByUserAndMonth(userId: string, yearMonth: string): Promise<Budget[]> {
    const result = await ddbDocClient.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': userPk(userId),
          ':skPrefix': `${BUDGET_SK_PREFIX}${yearMonth}#`,
        },
      }),
    );
    return (result.Items ?? []).map(fromItem);
  }

  async put(budget: Budget): Promise<void> {
    await ddbDocClient.send(
      new PutCommand({ TableName: getTableName(), Item: toItem(budget) }),
    );
  }
}
