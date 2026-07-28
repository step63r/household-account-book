import { z } from 'zod';

/**
 * pendingDeletion: 退会操作を受け付け、論理削除済み（表示・ログインは不可）。
 * deletionScheduledAt を過ぎたらバッチで物理削除する。
 */
export const userStatusSchema = z.enum(['active', 'pendingDeletion']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  status: userStatusSchema,
  deletionRequestedAt: z.string().datetime().optional(),
  deletionScheduledAt: z.string().datetime().optional(),
  /** 利用規約・プライバシーポリシー（結合バージョン）に同意済みのバージョン */
  termsAgreedVersion: z.string().optional(),
  termsAgreedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;
