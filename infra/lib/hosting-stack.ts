import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import type { Construct } from 'constructs';

export interface HostingStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'prod';
  /**
   * `https://github.com/<owner>/<repo>` - set via `-c amplifyGithubRepoUrl=...` once this repo
   * has a GitHub remote. Left empty by default: TODO wiring, not a live connection.
   */
  readonly githubRepoUrl?: string;
  /**
   * Name of a Secrets Manager secret holding a GitHub PAT with `repo` scope, used to create the
   * Amplify webhook/deploy key. Never pass the token itself as a context value/plaintext - CDK
   * context ends up in cdk.context.json and CloudFormation template metadata. Set via
   * `-c amplifyGithubTokenSecretName=...` once the secret exists.
   */
  readonly githubTokenSecretName?: string;
}

/**
 * Amplify Hosting app for the frontend SPA. Default `*.amplifyapp.com` domain only - no
 * Route 53 / custom domain / ACM cert (see CLAUDE.md).
 *
 * TODO(frontend-repo-connection): this app is intentionally NOT connected to a live GitHub repo
 * yet - this repo has no GitHub remote and no access token is available at scaffold time.
 * Once both exist, pass `-c amplifyGithubRepoUrl=https://github.com/<owner>/<repo>` and
 * `-c amplifyGithubTokenSecretName=<secret name>` (a Secrets Manager secret holding a GitHub
 * PAT, created out-of-band, e.g. `aws secretsmanager create-secret`) and this construct will
 * wire up `GitHubSourceCodeProvider` + a `main` branch automatically. Until then this stack
 * only provisions the bare App resource (no source provider, no branch, no build triggers).
 */
export class HostingStack extends cdk.Stack {
  public readonly app: amplify.App;

  constructor(scope: Construct, id: string, props: HostingStackProps) {
    super(scope, id, props);

    const sourceCodeProvider = this.buildSourceCodeProvider(props);

    this.app = new amplify.App(this, 'FrontendApp', {
      appName: `household-${props.stage}-frontend`,
      sourceCodeProvider,
      platform: amplify.Platform.WEB,
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

    // Only add a deployable branch once there's an actual repo connected - an auto-created
    // branch with no source provider can't build anything.
    if (sourceCodeProvider) {
      this.app.addBranch('main', { stage: props.stage === 'prod' ? 'PRODUCTION' : 'DEVELOPMENT' });
    }
  }

  private buildSourceCodeProvider(props: HostingStackProps): amplify.GitHubSourceCodeProvider | undefined {
    if (!props.githubRepoUrl || !props.githubTokenSecretName) {
      return undefined;
    }
    const { owner, repository } = parseGitHubRepoUrl(props.githubRepoUrl);
    return new amplify.GitHubSourceCodeProvider({
      owner,
      repository,
      oauthToken: cdk.SecretValue.secretsManager(props.githubTokenSecretName),
    });
  }
}

function parseGitHubRepoUrl(url: string): { owner: string; repository: string } {
  const match = /github\.com\/([^/]+)\/([^/.]+)(\.git)?\/?$/.exec(url);
  if (!match) {
    throw new Error(`amplifyGithubRepoUrl is not a recognizable GitHub URL: ${url}`);
  }
  const [, owner, repository] = match;
  if (!owner || !repository) {
    throw new Error(`amplifyGithubRepoUrl is not a recognizable GitHub URL: ${url}`);
  }
  return { owner, repository };
}
