import { z } from 'zod';

/**
 * ログイン/サインアップ用フォームスキーマ。
 *
 * NOTE(backend): `@household/shared` には現時点で認証入力用の Zod スキーマが無いため、
 * ここでローカルに定義している。Cognito 連携時にサーバー側のパスワードポリシー等が
 * 決まったら `@household/shared` に `authInputSchema` 相当を追加して差し替えたい
 * （フロント側だけの判断で shared に追加するのは避けた）。
 *
 * パスワードの英大文字・小文字・数字必須は infra/lib/auth-stack.ts の Cognito
 * パスワードポリシー（`requireLowercase` / `requireUppercase` / `requireDigits`）と一致させている。
 */
export const emailPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください')
    .email('メールアドレスの形式が正しくありません'),
  password: z
    .string()
    .min(8, 'パスワードは8文字以上で入力してください')
    .regex(/[a-z]/, 'パスワードには英小文字を含めてください')
    .regex(/[A-Z]/, 'パスワードには英大文字を含めてください')
    .regex(/[0-9]/, 'パスワードには数字を含めてください'),
});
export type EmailPasswordFormValues = z.infer<typeof emailPasswordSchema>;

/**
 * サインアップフォーム専用スキーマ。emailPasswordSchema はログインフォーム
 * （LoginPage.tsx）とも共有しているため、そちらを直接拡張すると同意チェックボックスの
 * 必須バリデーションがログインフォームにも波及してしまう。そのため .extend() で
 * 別スキーマとして定義する。
 */
export const signUpSchema = emailPasswordSchema.extend({
  agreedToTerms: z.boolean().refine((value) => value === true, {
    message: '利用規約とプライバシーポリシーへの同意が必要です',
  }),
});
export type SignUpFormValues = z.infer<typeof signUpSchema>;

/** サインアップ後のメール確認コード入力用スキーマ。設定画面のメールアドレス変更確認でも再利用する。 */
export const confirmSignUpSchema = z.object({
  code: z.string().min(1, '確認コードを入力してください'),
});
export type ConfirmSignUpFormValues = z.infer<typeof confirmSignUpSchema>;

/** MFA（TOTP／メール共通）の6桁コード入力用スキーマ。MFA登録確認・ログイン時のMFAチャレンジで共用する。 */
export const mfaCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, '6桁の数字を入力してください'),
});
export type MfaCodeFormValues = z.infer<typeof mfaCodeSchema>;

/** 設定画面のメールアドレス変更フォーム用スキーマ。 */
export const changeEmailSchema = z.object({
  newEmail: z
    .string()
    .min(1, 'メールアドレスを入力してください')
    .email('メールアドレスの形式が正しくありません'),
});
export type ChangeEmailFormValues = z.infer<typeof changeEmailSchema>;

/** 設定画面のパスワード変更フォーム用スキーマ。パスワードルールは emailPasswordSchema と揃える。 */
export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, '現在のパスワードを入力してください'),
    newPassword: z
      .string()
      .min(8, 'パスワードは8文字以上で入力してください')
      .regex(/[a-z]/, 'パスワードには英小文字を含めてください')
      .regex(/[A-Z]/, 'パスワードには英大文字を含めてください')
      .regex(/[0-9]/, 'パスワードには数字を含めてください'),
    newPasswordConfirmation: z.string().min(1, '新しいパスワード（確認）を入力してください'),
  })
  .refine((data) => data.newPassword === data.newPasswordConfirmation, {
    message: 'パスワードが一致しません',
    path: ['newPasswordConfirmation'],
  })
  .refine((data) => data.newPassword !== data.oldPassword, {
    message: '新しいパスワードは現在のパスワードと異なるものにしてください',
    path: ['newPassword'],
  });
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

/** パスワード再設定（忘れた場合）のリクエストフォーム用スキーマ。 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください')
    .email('メールアドレスの形式が正しくありません'),
});
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

/** パスワード再設定（忘れた場合）の新パスワード設定フォーム用スキーマ。パスワードルールは emailPasswordSchema と揃える。 */
export const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'パスワードは8文字以上で入力してください')
      .regex(/[a-z]/, 'パスワードには英小文字を含めてください')
      .regex(/[A-Z]/, 'パスワードには英大文字を含めてください')
      .regex(/[0-9]/, 'パスワードには数字を含めてください'),
    newPasswordConfirmation: z.string().min(1, '新しいパスワード（確認）を入力してください'),
  })
  .refine((data) => data.newPassword === data.newPasswordConfirmation, {
    message: 'パスワードが一致しません',
    path: ['newPasswordConfirmation'],
  });
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
