import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

export interface DataStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'prod';
}

/**
 * Single DynamoDB table, single-table design (see CLAUDE.md / apps/backend/src/repository/keys.ts).
 * Since the household-sharing feature, financial data lives under a household partition rather
 * than a per-user one, alongside a couple of small per-user/per-invite partitions:
 *   PK = HOUSEHOLD#<householdId>  SK = PROFILE | MEMBER#<userId> | TXN#<date>#<txnId> |
 *                                       CATEGORY#<categoryId> | BUDGET#<yyyymm>#<categoryId>
 *   PK = USER#<userId>            SK = PROFILE   (includes a householdId reference)
 *   PK = INVITE#<token>           SK = METADATA  (has a `ttl` attribute, see below)
 *
 * No GSI: every current access pattern queries by exact PK with an SK prefix/range (Query,
 * never Scan, aside from the withdrawal-batch's explicitly-approved exception in
 * userDeletionRepository.ts) - transactions by date range, categories by household, budgets by
 * month, invite lookup by token. Add a GSI only when a concrete pattern needs one (e.g. looking
 * up a transaction by id without its date), not speculatively.
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
      // Additive, in-place update (not a replacement): items without a `ttl` attribute (every
      // item written before this change) are simply never auto-expired. Used only by the
      // household-sharing feature's PK=INVITE#<token> items, which carry an epoch-seconds `ttl`
      // (see apps/backend/src/repository/inviteRepository.ts). Note DynamoDB TTL deletion can lag
      // up to ~48h, so the service layer never trusts item-absence alone to mean "not expired".
      timeToLiveAttribute: 'ttl',
    });

    new cdk.CfnOutput(this, 'TableName', { value: this.table.tableName });
  }
}
