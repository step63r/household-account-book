import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'prod';
  readonly userPool: cognito.IUserPool;
  readonly userPoolClient: cognito.IUserPoolClient;
  readonly table: dynamodb.ITable;
}

interface RouteDef {
  readonly method: apigwv2.HttpMethod;
  readonly path: string;
  /** Filename (no extension) under apps/backend/src/handlers/, exporting `handler`. */
  readonly handlerFile: string;
  /** Least-privilege DynamoDB actions this handler needs on the single table. */
  readonly dynamoActions: string[];
}

const HANDLERS_DIR = path.join(__dirname, '..', '..', 'apps', 'backend', 'src', 'handlers');

/**
 * Route table mirroring apps/backend/src/handlers/*.ts as of this writing (the backend agent
 * scaffolds those files concurrently with this stack - re-check that directory and extend this
 * list when new handlers land). Method + path come from each handler file's leading doc comment.
 * DynamoDB actions are derived from the operations each handler's service/TODO comments
 * describe (Query for reads, Get+Put/Delete for single-item read-modify-write, etc.) - keep
 * these in sync with the repository code as it's implemented, don't default to grantReadWriteData.
 *
 * Note: this only covers synchronous request handlers behind the HTTP API. The 30-day
 * physical-deletion batch for withdrawn accounts (CLAUDE.md's 退会 policy) is a separate
 * scheduled Lambda + EventBridge rule, not implemented yet - out of scope for this route table.
 */
const ROUTES: RouteDef[] = [
  // Categories - apps/backend/src/{handlers,services}/*Category*.ts
  {
    method: apigwv2.HttpMethod.GET,
    path: '/categories',
    handlerFile: 'listCategories',
    // Query = list existing; BatchWriteItem = lazy first-login preset seeding (categoryService.listCategories)
    dynamoActions: ['dynamodb:Query', 'dynamodb:BatchWriteItem'],
  },
  {
    method: apigwv2.HttpMethod.POST,
    path: '/categories',
    handlerFile: 'createCategory',
    dynamoActions: ['dynamodb:Query', 'dynamodb:PutItem'],
  },
  {
    method: apigwv2.HttpMethod.PUT,
    path: '/categories/{id}',
    handlerFile: 'updateCategory',
    dynamoActions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
  },
  {
    method: apigwv2.HttpMethod.DELETE,
    path: '/categories/{id}',
    handlerFile: 'deleteCategory',
    dynamoActions: ['dynamodb:GetItem', 'dynamodb:DeleteItem'],
  },
  // Transactions - handlers currently stubbed (501); actions per each file's TODO comment
  {
    method: apigwv2.HttpMethod.GET,
    path: '/transactions',
    handlerFile: 'listTransactions',
    dynamoActions: ['dynamodb:Query'],
  },
  {
    method: apigwv2.HttpMethod.POST,
    path: '/transactions',
    handlerFile: 'createTransaction',
    dynamoActions: ['dynamodb:PutItem'],
  },
  {
    method: apigwv2.HttpMethod.PUT,
    path: '/transactions/{id}',
    handlerFile: 'updateTransaction',
    // Query+Delete cover the "date changed -> delete old key, put new key" path the handler's TODO describes.
    dynamoActions: ['dynamodb:Query', 'dynamodb:PutItem', 'dynamodb:DeleteItem'],
  },
  {
    method: apigwv2.HttpMethod.DELETE,
    path: '/transactions/{id}',
    handlerFile: 'deleteTransaction',
    // Query covers locating the item by id (sort key embeds date; see handler TODO for the open question).
    dynamoActions: ['dynamodb:Query', 'dynamodb:DeleteItem'],
  },
  // Budgets
  {
    method: apigwv2.HttpMethod.GET,
    path: '/budgets',
    handlerFile: 'listBudgets',
    dynamoActions: ['dynamodb:Query'],
  },
  {
    method: apigwv2.HttpMethod.PUT,
    path: '/budgets',
    handlerFile: 'upsertBudget',
    dynamoActions: ['dynamodb:PutItem'],
  },
  // Aggregation - read-only, Query TXN#/CATEGORY#/BUDGET# ranges and reduce in Lambda memory (CLAUDE.md)
  {
    method: apigwv2.HttpMethod.GET,
    path: '/aggregation/trend',
    handlerFile: 'getTrend',
    dynamoActions: ['dynamodb:Query'],
  },
  {
    method: apigwv2.HttpMethod.GET,
    path: '/aggregation/category-pivot',
    handlerFile: 'getCategoryPivot',
    dynamoActions: ['dynamodb:Query'],
  },
  {
    method: apigwv2.HttpMethod.GET,
    path: '/aggregation/budget-variance',
    handlerFile: 'getBudgetVariance',
    dynamoActions: ['dynamodb:Query'],
  },
  // Account withdrawal (logical delete only - see the module-level note on the physical-deletion batch)
  {
    method: apigwv2.HttpMethod.POST,
    path: '/users/me/withdraw',
    handlerFile: 'withdrawUser',
    dynamoActions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
  },
  // Terms of Service / Privacy Policy consent (combined single version, packages/shared/src/consent.ts)
  {
    method: apigwv2.HttpMethod.GET,
    path: '/users/me/consent',
    handlerFile: 'getConsentStatus',
    // Get = read profile; Put = lazy PROFILE seed on first check (mirrors listCategories' lazy seeding)
    dynamoActions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
  },
  {
    method: apigwv2.HttpMethod.POST,
    path: '/users/me/consent',
    handlerFile: 'recordConsent',
    dynamoActions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
  },
];

export class ApiStack extends cdk.Stack {
  public readonly httpApi: apigwv2.HttpApi;
  public readonly functions: Record<string, NodejsFunction> = {};

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`;
    const authorizer = new HttpJwtAuthorizer('JwtAuthorizer', issuer, {
      jwtAudience: [props.userPoolClient.userPoolClientId],
    });

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `household-${props.stage}-api`,
      // Auth itself goes straight to Cognito from the frontend (not proxied through this API),
      // so every route here requires the JWT authorizer - no public routes.
      defaultAuthorizer: authorizer,
      corsPreflight: {
        // TODO: narrow to the Amplify app's actual domain once the frontend is hosted -
        // left wide open because that domain doesn't exist yet (HostingStack placeholder).
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    for (const route of ROUTES) {
      const fn = new NodejsFunction(this, `${route.handlerFile}Fn`, {
        entry: path.join(HANDLERS_DIR, `${route.handlerFile}.ts`),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64, // cheaper + faster cold start than x86_64
        memorySize: 256,
        timeout: cdk.Duration.seconds(10),
        environment: {
          TABLE_NAME: props.table.tableName,
        },
        bundling: {
          minify: true,
          target: 'node22',
        },
      });
      props.table.grant(fn, ...route.dynamoActions);
      this.functions[route.handlerFile] = fn;

      this.httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration: new HttpLambdaIntegration(`${route.handlerFile}Integration`, fn),
      });
    }

    new cdk.CfnOutput(this, 'ApiEndpoint', { value: this.httpApi.apiEndpoint });
  }
}
