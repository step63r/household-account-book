import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

// Mirrors auth-stack.ts's SENDER_DOMAIN: the same pre-existing, already-verified SES domain
// identity (set up outside this repo). Deliberately NOT created as a CDK resource here either -
// see auth-stack.ts's comment on SENDER_DOMAIN for the rationale.
const SENDER_DOMAIN = 'minatoproject.com';
const SENDER_EMAIL = `sender@${SENDER_DOMAIN}`;

export interface ApiStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'prod';
  readonly userPool: cognito.IUserPool;
  readonly userPoolClient: cognito.IUserPoolClient;
  readonly table: dynamodb.ITable;
  /** Base URL of the frontend, embedded in invite-email links by createInvite. Same value
   *  passed to AuthStack for its password-reset emails - reused, not recomputed. */
  readonly frontendBaseUrl?: string;
}

interface RouteDef {
  readonly method: apigwv2.HttpMethod;
  readonly path: string;
  /** Filename (no extension) under apps/backend/src/handlers/, exporting `handler`. */
  readonly handlerFile: string;
  /** Least-privilege DynamoDB actions this handler needs on the single table. */
  readonly dynamoActions: string[];
  /** @default 'jwt' */
  readonly authorizer?: 'jwt' | 'none';
  /** Extra Lambda environment variables beyond the always-set TABLE_NAME. */
  readonly environment?: Record<string, string>;
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
 * scheduled Lambda + EventBridge rule, implemented in infra/lib/batch-stack.ts (BatchStack) -
 * out of scope for this route table.
 *
 * A function rather than a plain module-level constant only because createInvite's `environment`
 * needs `props.frontendBaseUrl`, which isn't known until the stack is instantiated.
 */
function buildRoutes(props: ApiStackProps): RouteDef[] {
  return [
    // Categories - apps/backend/src/{handlers,services}/*Category*.ts
    {
      method: apigwv2.HttpMethod.GET,
      path: '/categories',
      handlerFile: 'listCategories',
      // Query = list existing; BatchWriteItem = lazy first-login preset seeding (categoryService.listCategories).
      // GetItem (household-sharing) = getUserContext's USER#<userId>/PROFILE read to resolve householdId.
      dynamoActions: ['dynamodb:Query', 'dynamodb:BatchWriteItem', 'dynamodb:GetItem'],
    },
    {
      method: apigwv2.HttpMethod.POST,
      path: '/categories',
      handlerFile: 'createCategory',
      // GetItem (household-sharing) = getUserContext's householdId lookup, see above.
      dynamoActions: ['dynamodb:Query', 'dynamodb:PutItem', 'dynamodb:GetItem'],
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
      // GetItem = DynamoUserRepository.getProfile plan check (free/paid) run on every request.
      dynamoActions: ['dynamodb:Query', 'dynamodb:GetItem'],
    },
    {
      method: apigwv2.HttpMethod.POST,
      path: '/transactions',
      handlerFile: 'createTransaction',
      // GetItem = plan check (see above).
      dynamoActions: ['dynamodb:PutItem', 'dynamodb:GetItem'],
    },
    {
      method: apigwv2.HttpMethod.PUT,
      path: '/transactions/{id}',
      handlerFile: 'updateTransaction',
      // Query+Delete cover the "date changed -> delete old key, put new key" path the handler's TODO describes.
      // GetItem = plan check (see above).
      dynamoActions: [
        'dynamodb:Query',
        'dynamodb:PutItem',
        'dynamodb:DeleteItem',
        'dynamodb:GetItem',
      ],
    },
    {
      method: apigwv2.HttpMethod.DELETE,
      path: '/transactions/{id}',
      handlerFile: 'deleteTransaction',
      // Query covers locating the item by id (sort key embeds date; see handler TODO for the open question).
      // GetItem = plan check (see above).
      dynamoActions: ['dynamodb:Query', 'dynamodb:DeleteItem', 'dynamodb:GetItem'],
    },
    // Budgets
    {
      method: apigwv2.HttpMethod.GET,
      path: '/budgets',
      handlerFile: 'listBudgets',
      // GetItem (household-sharing) = getUserContext's householdId lookup, see listCategories above.
      dynamoActions: ['dynamodb:Query', 'dynamodb:GetItem'],
    },
    {
      method: apigwv2.HttpMethod.PUT,
      path: '/budgets',
      handlerFile: 'upsertBudget',
      // GetItem (household-sharing) = getUserContext's householdId lookup, see listCategories above.
      dynamoActions: ['dynamodb:PutItem', 'dynamodb:GetItem'],
    },
    // Aggregation - read-only, Query TXN#/CATEGORY#/BUDGET# ranges and reduce in Lambda memory (CLAUDE.md)
    // GetItem on all four = DynamoUserRepository.getProfile plan check (free/paid) run on every request.
    {
      method: apigwv2.HttpMethod.GET,
      path: '/aggregation/trend',
      handlerFile: 'getTrend',
      dynamoActions: ['dynamodb:Query', 'dynamodb:GetItem'],
    },
    {
      method: apigwv2.HttpMethod.GET,
      path: '/aggregation/category-pivot',
      handlerFile: 'getCategoryPivot',
      dynamoActions: ['dynamodb:Query', 'dynamodb:GetItem'],
    },
    {
      method: apigwv2.HttpMethod.GET,
      path: '/aggregation/budget-variance',
      handlerFile: 'getBudgetVariance',
      dynamoActions: ['dynamodb:Query', 'dynamodb:GetItem'],
    },
    {
      method: apigwv2.HttpMethod.GET,
      path: '/aggregation/memo-suggestions',
      handlerFile: 'getMemoSuggestions',
      dynamoActions: ['dynamodb:Query', 'dynamodb:GetItem'],
    },
    // Current user profile (free/paid plan for frontend gating). Lazily creates the PROFILE item
    // on first access, same pattern as getConsentStatus below.
    {
      method: apigwv2.HttpMethod.GET,
      path: '/users/me',
      handlerFile: 'getProfile',
      dynamoActions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
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
    // Household sharing (getMyHousehold.ts/createInvite.ts/previewInvite.ts/acceptInvite.ts/leaveHousehold.ts) -
    // see householdService.ts / householdRepository.ts / inviteRepository.ts for the exact per-call
    // breakdown behind each dynamoActions list below.
    {
      method: apigwv2.HttpMethod.GET,
      path: '/households/me',
      handlerFile: 'getMyHousehold',
      // GetItem = USER PROFILE read + HOUSEHOLD PROFILE read + per-member USER PROFILE reads.
      // Query = listMembers. PutItem = ensureProfileWithHousehold's lazy household bootstrap on a
      // brand-new user's very first request (same lazy-create pattern as getProfile.ts/listCategories.ts).
      dynamoActions: ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:PutItem'],
    },
    {
      method: apigwv2.HttpMethod.PATCH,
      path: '/households/me',
      handlerFile: 'updateHousehold',
      // GetItem = USER PROFILE read (ensureProfileWithHousehold) + HOUSEHOLD PROFILE read (update
      // target + getMyHousehold's re-fetch) + per-member USER PROFILE reads. PutItem =
      // ensureProfileWithHousehold's lazy bootstrap + the household name update itself. Query =
      // getMyHousehold's listMembers.
      dynamoActions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
    },
    {
      method: apigwv2.HttpMethod.POST,
      path: '/households/me/invites',
      handlerFile: 'createInvite',
      // GetItem = USER PROFILE read + HOUSEHOLD PROFILE read (+ lazy-bootstrap PutItem below).
      // PutItem = ensureProfileWithHousehold's lazy bootstrap (see /households/me) + the new
      // INVITE#<token> item itself (householdService.createInvite). SES send permission is
      // granted separately below (not a DynamoDB action).
      dynamoActions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
      environment: {
        FRONTEND_BASE_URL: props.frontendBaseUrl ?? '',
        SENDER_EMAIL,
      },
    },
    {
      method: apigwv2.HttpMethod.GET,
      path: '/invites/{token}',
      handlerFile: 'previewInvite',
      // No authentication: a person clicking an email link isn't logged in yet
      // (apps/backend/src/handlers/previewInvite.ts deliberately doesn't call requireUserId/requireEmail).
      authorizer: 'none',
      // GetItem only = INVITE lookup + HOUSEHOLD PROFILE + inviter USER PROFILE reads, no writes.
      dynamoActions: ['dynamodb:GetItem'],
    },
    {
      method: apigwv2.HttpMethod.POST,
      path: '/invites/{token}/accept',
      handlerFile: 'acceptInvite',
      // GetItem/PutItem = ensureProfileWithHousehold (+ lazy bootstrap) + invite/household reads +
      // committing the caller's new household membership. DeleteItem = removing the old MEMBER#
      // item + the accepted INVITE# item. Query/BatchWriteItem = isFresh check + best-effort
      // deleteAllItems cascade of the caller's now-empty old household (householdRepository.ts).
      dynamoActions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:BatchWriteItem',
      ],
    },
    {
      method: apigwv2.HttpMethod.POST,
      path: '/households/me/leave',
      handlerFile: 'leaveHousehold',
      // GetItem/PutItem = ensureProfileWithHousehold (+ lazy bootstrap) + bootstrapping the new
      // replacement household + committing the caller's new household reference. DeleteItem =
      // removing the caller's old MEMBER# item (best-effort). Query = listMembers (SOLE_MEMBER check).
      dynamoActions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
      ],
    },
  ];
}

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
      // Auth itself goes straight to Cognito from the frontend (not proxied through this API), so
      // every route defaults to the JWT authorizer. The lone exception is GET /invites/{token}
      // (authorizer: 'none' in ROUTES) - a person clicking an invite email link isn't logged in yet.
      defaultAuthorizer: authorizer,
      corsPreflight: {
        // TODO: narrow to the Amplify app's actual domain once the frontend is hosted -
        // left wide open because that domain doesn't exist yet (HostingStack placeholder).
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    const routes = buildRoutes(props);
    for (const route of routes) {
      const fn = new NodejsFunction(this, `${route.handlerFile}Fn`, {
        entry: path.join(HANDLERS_DIR, `${route.handlerFile}.ts`),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64, // cheaper + faster cold start than x86_64
        memorySize: 256,
        timeout: cdk.Duration.seconds(10),
        environment: {
          TABLE_NAME: props.table.tableName,
          ...route.environment,
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
        authorizer: route.authorizer === 'none' ? new apigwv2.HttpNoneAuthorizer() : undefined,
      });
    }

    // Imperative, not folded into the generic per-route dynamoActions grant loop above: this is
    // the one route needing a non-DynamoDB permission (SES send), scoped to just the pre-existing,
    // already-verified minatoproject.com domain identity (see SENDER_DOMAIN above / auth-stack.ts).
    const createInviteFn = this.functions['createInvite'];
    if (!createInviteFn) {
      throw new Error('createInvite route not found in ROUTES - SES grant would be a no-op');
    }
    createInviteFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: [`arn:aws:ses:${this.region}:${this.account}:identity/${SENDER_DOMAIN}`],
      }),
    );

    new cdk.CfnOutput(this, 'ApiEndpoint', { value: this.httpApi.apiEndpoint });
  }
}
