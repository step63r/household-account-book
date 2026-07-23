import { z } from 'zod';

/**
 * ログイン/サインアップ用フォームスキーマ。
 *
 * NOTE(backend): `@household/shared` には現時点で認証入力用の Zod スキーマが無いため、
 * ここでローカルに定義している。Cognito 連携時にサーバー側のパスワードポリシー等が
 * 決まったら `@household/shared` に `authInputSchema` 相当を追加して差し替えたい
 * （フロント側だけの判断で shared に追加するのは避けた）。
 */
export const emailPasswordSchema = z.object({
  email: z.string().min(1, 'メールアドレスを入力してください').email('メールアドレスの形式が正しくありません'),
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
});
export type EmailPasswordFormValues = z.infer<typeof emailPasswordSchema>;
