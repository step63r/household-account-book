import { z } from 'zod';

/**
 * pendingDeletion: 退会操作を受け付け、論理削除済み（表示・ログインは不可）。
 * deletionScheduledAt を過ぎたらバッチで物理削除する。
 */
export const userStatusSchema = z.enum(['active', 'pendingDeletion']);
export type UserStatus = z.infer<typeof userStatusSchema>;

/** free: 過去3か月分のみ参照・登録・更新可。paid: 全期間可。プラン定義は plan.ts 参照。 */
export const userPlanSchema = z.enum(['free', 'paid']);
export type UserPlan = z.infer<typeof userPlanSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  status: userStatusSchema,
  deletionRequestedAt: z.string().datetime().optional(),
  deletionScheduledAt: z.string().datetime().optional(),
  /** 利用規約・プライバシーポリシー（結合バージョン）に同意済みのバージョン */
  termsAgreedVersion: z.string().optional(),
  termsAgreedAt: z.string().datetime().optional(),
  /** 未設定の既存レコードは free 扱い（userService.ts の読み込み側で補完） */
  plan: userPlanSchema,
  planUpdatedAt: z.string().datetime().optional(),
  /**
   * 所属世帯への参照。optional なのは、家族共有機能導入前に作成された既存プロフィールが
   * 移行スクリプト（scripts/migrateUsersToHouseholds.ts）実行前は未設定のまま存在しうる
   * 過渡状態を表現するため。userService.ts の ensureProfileWithHousehold はこの値が
   * 無いプロフィールを検出したら移行未実施として明示的にエラーを返す（フェイルラウド）。
   */
  householdId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;

/** GET /users/me レスポンス。フロントのプラン判定用に必要最小限のフィールドのみ返す。 */
export const userProfileResponseSchema = z.object({
  plan: userPlanSchema,
});
export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;
