import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as cdk from 'aws-cdk-lib';
import { CfnApp } from 'aws-cdk-lib/aws-amplify';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import type { Construct } from 'constructs';

export interface HostingStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'prod';
  /**
   * `https://github.com/<owner>/<repo>` - set via `-c amplifyGithubRepoUrl=...`. Left empty by
   * default: TODO wiring, not a live connection.
   */
  readonly githubRepoUrl?: string;
  /** Baked into the frontend build as VITE_COGNITO_USER_POOL_ID (see apps/frontend/.env.example). */
  readonly userPoolId: string;
  /** Baked into the frontend build as VITE_COGNITO_CLIENT_ID. */
  readonly userPoolClientId: string;
  /** Baked into the frontend build as VITE_API_BASE_URL. */
  readonly apiEndpoint: string;
}

/**
 * Amplify Hosting app for the frontend SPA. Default `*.amplifyapp.com` domain only - no
 * Route 53 / custom domain / ACM cert (see CLAUDE.md).
 *
 * The GitHub connection itself is intentionally NOT managed by this construct. It was
 * originally wired via `amplify.GitHubSourceCodeProvider` (a PAT stored in Secrets Manager,
 * passed as `OauthToken`), but the app was since migrated to AWS's GitHub App-based
 * authorization via the Amplify console (the PAT/OAuth token approach is being retired by AWS).
 * `AWS::Amplify::App` has no CloudFormation property to declare a GitHub App connection, so
 * CDK only sets `Repository` directly (via the L1 escape hatch) to keep that field's source of
 * truth in code, and leaves `OauthToken`/`AccessToken` unset - Amplify's UpdateApp API treats
 * omitted auth fields as "leave the existing connection alone" rather than clearing it, so this
 * doesn't disturb the console-managed GitHub App connection on redeploy.
 */
export class HostingStack extends cdk.Stack {
  public readonly app: amplify.App;

  constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props);

    this.app = new amplify.App(this, 'FrontendApp', {
      appName: `household-${props.stage}-frontend`,
      platform: amplify.Platform.WEB,
      // Vite only inlines VITE_* vars that are present in the build environment - CodeBuild
      // doesn't see the developer's local apps/frontend/.env (gitignored, never in the repo),
      // so these must be injected here for the production build to pick them up.
      environmentVariables: {
        VITE_API_BASE_URL: props.apiEndpoint,
        VITE_COGNITO_USER_POOL_ID: props.userPoolId,
        VITE_COGNITO_CLIENT_ID: props.userPoolClientId,
      },
      // The frontend is a client-side-routed SPA (React Router), so a direct request for e.g.
      // /transactions has no matching object in the Amplify Hosting bucket and 404s unless
      // rewritten to index.html - this affects both browser refresh and typing a path directly.
      customRules: [amplify.CustomRule.SINGLE_PAGE_APPLICATION_REDIRECT],
      buildSpec: codebuild.BuildSpec.fromObjectToYaml({
        version: 1,
        applications: [
          {
            appRoot: 'apps/frontend',
            frontend: {
              phases: {
                preBuild: {
                  commands: ['corepack enable', 'pnpm install --frozen-lockfile'],
                },
                build: {
                  commands: ['pnpm --filter @household/frontend build'],
                },
              },
              artifacts: {
                baseDirectory: 'dist',
                files: ['**/*'],
              },
              cache: {
                paths: ['node_modules/**/*'],
              },
            },
          },
        ],
      }),
    });

    if (props.githubRepoUrl) {
      // See the class doc comment: intentionally Repository only, no OauthToken/AccessToken.
      const cfnApp = this.app.node.defaultChild as CfnApp;
      cfnApp.repository = props.githubRepoUrl;

      // Only add a deployable branch once there's an actual repo connected - an auto-created
      // branch with no repository can't build anything. Branch name is "master", not the more
      // common "main" - that's this repo's actual default branch (git remote has no "main").
      this.app.addBranch('master', {
        stage: props.stage === 'prod' ? 'PRODUCTION' : 'DEVELOPMENT',
      });
    }
  }
}
