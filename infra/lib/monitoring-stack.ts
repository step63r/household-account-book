import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';

export interface MonitoringStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'prod';
  /** Named Lambda functions to alarm on error rate, keyed by handler name. */
  readonly functions: Record<string, NodejsFunction>;
  readonly table: dynamodb.ITable;
  /**
   * Notification email. Left unset by default (no email context value has been confirmed yet) -
   * pass `-c alertEmail=you@example.com` to subscribe. Without it the SNS topic still exists and
   * alarms still fire into it, there's just nobody subscribed yet.
   */
  readonly alertEmail?: string;
}

/**
 * CloudWatch alarms for Lambda error rate and DynamoDB throttling, fanned into one SNS topic.
 * No AWS Budgets alarm here - explicitly deferred (CLAUDE.md / infra-cdk persona).
 */
export class MonitoringStack extends cdk.Stack {
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    this.alertTopic = new sns.Topic(this, 'AlertsTopic', {
      topicName: `household-${props.stage}-alerts`,
    });

    if (props.alertEmail) {
      this.alertTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    }
    // else: TODO - no alertEmail context value supplied; subscribe one with
    // `-c alertEmail=<address>` (see bin/app.ts) before relying on these alarms.

    const alarmAction = new cwActions.SnsAction(this.alertTopic);

    for (const [name, fn] of Object.entries(props.functions)) {
      new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        alarmName: `household-${props.stage}-${name}-errors`,
        alarmDescription: `${name} Lambda is returning errors`,
        metric: fn.metricErrors({ period: cdk.Duration.minutes(5), statistic: 'Sum' }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(alarmAction);
    }

    new cloudwatch.Alarm(this, 'TableThrottleAlarm', {
      alarmName: `household-${props.stage}-table-throttles`,
      alarmDescription: 'DynamoDB table is throttling requests (on-demand capacity, so this signals a hot partition, not a capacity ceiling)',
      metric: props.table.metricThrottledRequestsForOperations({
        operations: [
          dynamodb.Operation.GET_ITEM,
          dynamodb.Operation.QUERY,
          dynamodb.Operation.PUT_ITEM,
          dynamodb.Operation.UPDATE_ITEM,
          dynamodb.Operation.DELETE_ITEM,
          dynamodb.Operation.BATCH_WRITE_ITEM,
        ],
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);
  }
}
