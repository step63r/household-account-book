import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

export interface DataStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'prod';
}

/**
 * Single DynamoDB table, single-table design (see CLAUDE.md / apps/backend/src/repository/keys.ts):
 *   PK = USER#<userId>
 *   SK = TXN#<date>#<txnId> | CATEGORY#<categoryId> | BUDGET#<yyyymm>#<categoryId>
 *
 * No GSI: every current access pattern queries by exact PK with an SK prefix/range (Query,
 * never Scan) - transactions by date range, categories by user, budgets by month. Add a GSI
 * only when a concrete pattern needs one (e.g. looking up a transaction by id without its
 * date), not speculatively.
 */
export class DataStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: `household-${props.stage}-table`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // on-demand: near-zero idle cost, no capacity planning
      // Financial data - protect against accidental item-level corruption/deletion with 35-day
      // (default) continuous backups, restorable to any point in time.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, 'TableName', { value: this.table.tableName });
  }
}
