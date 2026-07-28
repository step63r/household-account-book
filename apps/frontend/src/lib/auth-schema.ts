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
  email: z.string().min(1, 'メールアドレスを入力してください').email('メールアドレスの形式が正しくありません'),
  password: z
    .string()
    .min(8, 'パスワードは8文字以上で入力してください')
    .regex(/[a-z]/, 'パスワードには英小文字を含めてください')
    .regex(/[A-Z]/, 'パスワードには英大文字を含めてください')
    .regex(/[0-9]/, 'パスワードには数字を含めてください'),
});
export type EmailPasswordFormValues = z.infer<typeof emailPasswordSchema>;

/** サインアップ後のメール確認コード入力用スキーマ。設定画面のメールアドレス変更確認でも再利用する。 */
export const confirmSignUpSchema = z.object({
  code: z.string().min(1, '確認コードを入力してください'),
});
export type ConfirmSignUpFormValues = z.infer<typeof confirmSignUpSchema>;

/** 設定画面のメールアドレス変更フォーム用スキーマ。 */
export const changeEmailSchema = z.object({
  newEmail: z.string().min(1, 'メールアドレスを入力してください').email('メールアドレスの形式が正しくありません'),
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
