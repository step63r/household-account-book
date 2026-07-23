import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * Single-table DynamoDB client shared by all repositories. The table name is provided by
 * infra via the `TABLE_NAME` env var on each Lambda's configuration - see repository README
 * for the key scheme (USER#<userId> partition key; CATEGORY# / TXN# / BUDGET# sort keys).
 */
const client = new DynamoDBClient({});

export const ddbDocClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export function getTableName(): string {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('TABLE_NAME environment variable is not set');
  }
  return tableName;
}
