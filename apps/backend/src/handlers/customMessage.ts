import type { CustomMessageTriggerHandler } from 'aws-lambda';

/**
 * Cognito CustomMessage trigger.
 *
 * Only rewrites the CustomMessage_ForgotPassword template so the confirmation code is
 * embedded in a "reset link" (`${FRONTEND_BASE_URL}/reset-password?email=...&code=...`)
 * per the product requirement that this feel like a reset link rather than a bare code.
 * All other trigger sources (sign-up confirmation, resend code, email/attribute change,
 * admin-created users, etc.) are left untouched so Cognito's default templates keep working.
 *
 * This is a Cognito-invoked trigger, not a user-initiated API call, so unlike the CRUD
 * handlers it does not emit an audit log line.
 */
export const handler: CustomMessageTriggerHandler = async (event) => {
  if (event.triggerSource !== 'CustomMessage_ForgotPassword') {
    return event;
  }

  const frontendBaseUrl = process.env.FRONTEND_BASE_URL;
  if (!frontendBaseUrl) {
    throw new Error('FRONTEND_BASE_URL environment variable is not set');
  }

  const email = event.request.userAttributes.email;
  if (!email) {
    throw new Error('CustomMessage_ForgotPassword event is missing the user email attribute');
  }
  const code = event.request.codeParameter;
  const resetUrl = `${frontendBaseUrl}/reset-password?email=${encodeURIComponent(email)}&code=${code}`;

  event.response.emailSubject = '【家計簿アプリ】パスワード再設定のご案内';
  event.response.emailMessage = `
    <p>家計簿アプリのパスワード再設定のリクエストを受け付けました。</p>
    <p>以下のリンクをクリックして、新しいパスワードを設定してください。</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>このリンクに心当たりがない場合は、本メールを破棄してください。</p>
  `;

  return event;
};
