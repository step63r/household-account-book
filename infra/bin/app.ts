import * as cdk from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack';
import { AuthStack } from '../lib/auth-stack';
import { DataStack } from '../lib/data-stack';
import { HostingStack } from '../lib/hosting-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

const stageContext = app.node.tryGetContext('stage');
const stage: 'dev' | 'prod' = stageContext === 'prod' ? 'prod' : 'dev';
if (stageContext !== undefined && stageContext !== 'dev' && stageContext !== 'prod') {
  throw new Error(`Invalid -c stage=${String(stageContext)}; expected "dev" or "prod"`);
}

// Not read from an env var: CDK context is the deliberate, explicit way to pick a stage
// (`cdk deploy -c stage=prod ...`) so nobody accidentally deploys to prod via a stale shell env.
const alertEmail: string | undefined = app.node.tryGetContext('alertEmail') || undefined;
const amplifyGithubRepoUrl: string | undefined = app.node.tryGetContext('amplifyGithubRepoUrl') || undefined;
const amplifyGithubTokenSecretName: string | undefined =
  app.node.tryGetContext('amplifyGithubTokenSecretName') || undefined;

// Same account/region for every stack in a stage; account/region are only known at synth/deploy
// time via the default AWS CLI environment, never hardcoded here.
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const stackNamePrefix = `Household-${stage}`;

const authStack = new AuthStack(app, `${stackNamePrefix}-Auth`, { stage, env });

const dataStack = new DataStack(app, `${stackNamePrefix}-Data`, { stage, env });

const apiStack = new ApiStack(app, `${stackNamePrefix}-Api`, {
  stage,
  env,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  table: dataStack.table,
});

new HostingStack(app, `${stackNamePrefix}-Hosting`, {
  stage,
  env,
  githubRepoUrl: amplifyGithubRepoUrl,
  githubTokenSecretName: amplifyGithubTokenSecretName,
  userPoolId: authStack.userPool.userPoolId,
  userPoolClientId: authStack.userPoolClient.userPoolClientId,
  apiEndpoint: apiStack.httpApi.apiEndpoint,
});

new MonitoringStack(app, `${stackNamePrefix}-Monitoring`, {
  stage,
  env,
  functions: apiStack.functions,
  table: dataStack.table,
  alertEmail,
});
