import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'prod';
}

/**
 * Cognito User Pool for email/password sign-in.
 *
 * Deliberately left extensible for later, without any pool restructuring:
 * - `signInAliases: { email }` + no `supportedIdentityProviders` beyond COGNITO on the client
 *   means external IdPs (Google/Apple/etc.) can be added later as `UserPoolIdentityProvider`
 *   constructs and appended to the client's `supportedIdentityProviders` - additive, not a
 *   pool replacement.
 * - `mfa: Mfa.OPTIONAL` with no `mfaSecondFactor` configured leaves MFA off by default today
 *   (users aren't prompted) while keeping `MfaConfiguration` on the pool already set to a value
 *   CloudFormation can update in place later (flipping to `OFF`->`OPTIONAL` is a replacement in
 *   some SDKs, but `OPTIONAL`->`OPTIONAL` with an added `mfaSecondFactor` is not).
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `household-${props.stage}-user-pool`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      // No mfaSecondFactor configured, so no user is actually prompted for MFA today - this
      // just pre-positions the pool so turning MFA on later is a config flip, not a rebuild.
      // Prod holds real user accounts; dev doesn't need the same blast-radius protection.
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      authFlows: { userSrp: true },
      generateSecret: false, // public SPA client (frontend talks to Cognito directly)
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Consumed by the frontend to configure its Cognito client directly (no Amplify backend config yet).
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
  }
}
