import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

export interface InviteEmailParams {
  to: string;
  householdName: string;
  invitedByEmail: string;
  inviteUrl: string;
}

/**
 * Outbound transactional email, kept behind an interface so service-layer logic
 * (`householdService.createInvite`) can be unit-tested against a fake instead of real SES.
 */
export interface EmailSender {
  sendInviteEmail(params: InviteEmailParams): Promise<void>;
}

const client = new SESv2Client({});

/**
 * Sends the household invite email via SES. Unlike the password-reset email
 * (`handlers/customMessage.ts`, a Cognito CustomMessage trigger), invites aren't a Cognito
 * flow - there's no CustomMessage trigger source for an arbitrary application-defined token,
 * so this Lambda sends the email directly via SESv2's SendEmail API.
 */
export class SesEmailSender implements EmailSender {
  constructor(private readonly senderEmail: string) {}

  async sendInviteEmail(params: InviteEmailParams): Promise<void> {
    const { to, householdName, invitedByEmail, inviteUrl } = params;
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: this.senderEmail,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: '【家計簿アプリ】世帯への招待' },
            Body: {
              Html: {
                Data: `
                  <p>${invitedByEmail} さんから、家計簿アプリの世帯「${householdName}」への招待が届いています。</p>
                  <p>以下のリンクをクリックして、招待の内容を確認してください。</p>
                  <p><a href="${inviteUrl}">${inviteUrl}</a></p>
                  <p>このリンクの有効期限は発行から7日間です。心当たりがない場合は、本メールを破棄してください。</p>
                `,
              },
            },
          },
        },
      }),
    );
  }
}

/** In-memory EmailSender for unit tests. Never touches AWS - records every call so tests can
 * assert on the params a service passed through. */
export class FakeEmailSender implements EmailSender {
  readonly sentEmails: InviteEmailParams[] = [];

  async sendInviteEmail(params: InviteEmailParams): Promise<void> {
    this.sentEmails.push(params);
  }
}
