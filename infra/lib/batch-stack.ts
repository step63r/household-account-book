import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

export interface BatchStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'prod';
  readonly table: dynamodb.ITable;
}

/**
 * Withdrawal physical-deletion batch (CLAUDE.md "退会時のデータ削除": 論理削除 + 30日の猶予期間後に
 * バッチで物理削除). Not part of ApiStack: ApiStack's ROUTES table is HTTP-API-route-specific
 * structured data, and this Lambda has no route - it's invoked on a schedule, not by API Gateway.
 *
 * apps/backend/src/handlers/deleteWithdrawnUsers.ts (ScheduledHandler) scans PROFILE items for
 * `status = 'pendingDeletion' AND deletionScheduledAt <= now` (Scan+FilterExpression is an
 * explicitly-approved exception to the "Query only, no Scan" table design, limited to this
 * once-a-day offline batch - the table has no GSI for status x date), then for each candidate
 * user Query's every item under that PK and BatchWriteItem-deletes them.
 */
export class BatchStack extends cdk.Stack {
  public readonly functions: Record<string, NodejsFunction> = {};

  constructor(scope: Construct, id: string, props: BatchStackProps) {
    super(scope, id, props);

    const fn = new NodejsFunction(this, 'deleteWithdrawnUsersFn', {
      entry: path.join(
        __dirname,
        '..',
        '..',
        'apps',
        'backend',
        'src',
        'handlers',
        'deleteWithdrawnUsers.ts',
      ),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64, // cheaper + faster cold start than x86_64
      memorySize: 256,
      // Longer than the 10s API handlers: Scan across all users plus Query+BatchWriteItem for
      // every deletion candidate happen in a single invocation.
      timeout: cdk.Duration.seconds(60),
      environment: {
        TABLE_NAME: props.table.tableName,
      },
      bundling: {
        minify: true,
        target: 'node22',
      },
    });
    // Least-privilege: Scan (find candidates) + Query (list a candidate's items) +
    // BatchWriteItem (delete them) only - no grantReadWriteData, matching ApiStack's policy.
    props.table.grant(fn, 'dynamodb:Scan', 'dynamodb:Query', 'dynamodb:BatchWriteItem');
    this.functions['deleteWithdrawnUsers'] = fn;

    // Once a day, off-peak JST hours (18:10 UTC = 03:10 JST) so it doesn't compete with any
    // interactive traffic. EventBridge Scheduler (aws-events/aws-events-targets, bundled in
    // aws-cdk-lib) rather than the newer aws-scheduler-alpha module, to avoid adding a new
    // (still-alpha) package dependency for a single daily cron rule.
    const rule = new events.Rule(this, 'DailyScheduleRule', {
      ruleName: `household-${props.stage}-withdrawal-deletion-schedule`,
      schedule: events.Schedule.cron({ minute: '10', hour: '18' }),
    });
    rule.addTarget(new targets.LambdaFunction(fn));
  }
}
