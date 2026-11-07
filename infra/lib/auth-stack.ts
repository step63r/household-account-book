import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

// This domain identity already exists and is verified in SES (set up outside this repo, for
// another project sharing this AWS account - confirmed verified/production-access via
// `aws sesv2 get-email-identity`/`get-account`). Deliberately NOT created as a CDK resource
// here: this stack must not take ownership of a resource another project depends on.
const SENDER_DOMAIN = 'minatoproject.com';
const SENDER_EMAIL = `sender@${SENDER_DOMAIN}`;

export interface AuthStackProps extends cdk.StackProps {
  readonly stage: 'dev' | 'prod';
  /** Base URL of the frontend (e.g. the Amplify app domain), used to build the reset-password
   *  link embedded in the CustomMessage_ForgotPassword email. Passed through to the
   *  CustomMessage trigger Lambda as FRONTEND_BASE_URL. */
  readonly frontendBaseUrl?: string;
}

/**
 * Cognito User Pool for email/password sign-in.
 *
 * Deliberately left extensible for later, without any pool restructuring:
 * - `signInAliases: { email }` + no `supportedIdentityProviders` beyond COGNITO on the client
 *   means external IdPs (Google/Apple/etc.) can be added later as `UserPoolIdentityProvider`
 *   constructs and appended to the client's `supportedIdentityProviders` - additive, not a
 *   pool replacement.
 * - `mfa: Mfa.OPTIONAL` with `mfaSecondFactor: { otp: true, sms: false }` lets users opt into
 *   TOTP (authenticator app, e.g. Microsoft Authenticator) MFA from the Settings screen, without
 *   requiring it pool-wide. SMS is deliberately not enabled (no SNS/origination number setup).
 * - Passkeys (WebAuthn) are enabled as an additional first factor alongside the password
 *   (`signInPolicy`). The relying party ID is the host of `frontendBaseUrl`, so passkeys only work
 *   on that exact host - not on `localhost` or the default `*.amplifyapp.com` domain - and changing
 *   it later invalidates every registered passkey.
 * - `keepOriginal: { email: true }` requires verification of a new email address (a code sent to
 *   it) before the attribute actually changes, instead of updating immediately - this backs the
 *   Settings screen's email-change flow, which reuses the same OTP-confirmation UX as sign-up.
 *
 * Outbound email (verification codes, password recovery) is sent via SES from the
 * `minatoproject.com` domain identity rather than Cognito's default sender, so it isn't
 * capped at Cognito's low default sending quota. That SES identity is pre-existing and
 * verified outside this stack (see `SENDER_DOMAIN` above) - not managed here as a CDK
 * resource on purpose.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // The RP ID must be a registrable suffix of the origin the browser uses, and a pool holds only
    // one. Derived from frontendBaseUrl so it can't drift from the real host; when unset (no known
    // frontend host) passkeys are left off rather than guessing a domain.
    const passkeyRelyingPartyId = props.frontendBaseUrl
      ? new URL(props.frontendBaseUrl).hostname
      : undefined;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `household-${props.stage}-user-pool`,
      // Passkeys require Essentials or higher. Pinned to the tier the prod pool already runs on
      // (confirmed via `describe-user-pool`) so this is a no-op there, and so CDK's own check that
      // rejects non-password factors on LITE can't be tripped by an implicit default.
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      ...(passkeyRelyingPartyId
        ? {
            // Passkey is an additional first factor next to the password, not a replacement:
            // registering a passkey needs an already-signed-in session, and password reset is the
            // recovery path when a device is lost. CDK requires `password: true` anyway.
            signInPolicy: { allowedFirstAuthFactors: { password: true, passkey: true } },
            passkeyRelyingPartyId,
            // A passkey that can be used without biometrics/PIN would be a single weak factor.
            passkeyUserVerification: cognito.PasskeyUserVerification.REQUIRED,
          }
        : {}),
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      keepOriginal: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      // Prod holds real user accounts; dev doesn't need the same blast-radius protection.
      removalPolicy: props.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      email: cognito.UserPoolEmail.withSES({
        fromEmail: SENDER_EMAIL,
        fromName: '家計簿アプリ',
        sesVerifiedDomain: SENDER_DOMAIN,
      }),
    });

    if (passkeyRelyingPartyId) {
      // Without this, a user who has enrolled TOTP MFA is never offered WEB_AUTHN in choice-based
      // sign-in (only PASSWORD/PASSWORD_SRP) while MFA is OPTIONAL, per the Cognito MFA docs. That
      // locks out exactly the users who care most about security. With this set, a passkey used
      // with user verification (biometrics/PIN, enforced above) counts as satisfying MFA by itself.
      // No L2 property exists for it yet, hence the escape hatch.
      (this.userPool.node.defaultChild as cognito.CfnUserPool).webAuthnFactorConfiguration =
        'MULTI_FACTOR_WITH_USER_VERIFICATION';
    }

    // Customizes the CustomMessage_ForgotPassword email to embed the confirmation code in a
    // reset-password link (${FRONTEND_BASE_URL}/reset-password?email=...&code=...) instead of
    // Cognito's default plain-code email. See apps/backend/src/handlers/customMessage.ts.
    const customMessageFn = new NodejsFunction(this, 'customMessageFn', {
      entry: path.join(
        __dirname,
        '..',
        '..',
        'apps',
        'backend',
        'src',
        'handlers',
        'customMessage.ts',
      ),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        FRONTEND_BASE_URL: props.frontendBaseUrl ?? '',
      },
      bundling: {
        minify: true,
        target: 'node22',
      },
    });
    this.userPool.addTrigger(cognito.UserPoolOperation.CUSTOM_MESSAGE, customMessageFn);

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      // `userSrp` stays for the existing password login (amazon-cognito-identity-js); `user`
      // (ALLOW_USER_AUTH, choice-based sign-in) is what the passkey sign-in flow starts from.
      authFlows: { userSrp: true, user: true },
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
