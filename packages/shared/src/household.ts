import { z } from 'zod';

/** 新規世帯作成時のデフォルト名。編集UIはv1では未提供（固定値）。 */
export const DEFAULT_HOUSEHOLD_NAME = 'マイ家計';

/** 招待リンクの有効期限（日数）。 */
export const INVITE_EXPIRY_DAYS = 7;

export const householdSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Household = z.infer<typeof householdSchema>;

/**
 * 永続化用のメンバーシップ。role フィールドを持たない（世帯内は全員フラット権限）。
 * email はキャッシュしない（USER#<userId>/PROFILE から都度解決する）。
 */
export const householdMemberSchema = z.object({
  householdId: z.string(),
  userId: z.string(),
  joinedAt: z.string().datetime(),
});
export type HouseholdMember = z.infer<typeof householdMemberSchema>;

/** GET /households/me レスポンス用。メンバーの email を解決済みの形で返す。 */
export const householdMemberSummarySchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  joinedAt: z.string().datetime(),
});
export type HouseholdMemberSummary = z.infer<typeof householdMemberSummarySchema>;

export const householdSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  members: z.array(householdMemberSummarySchema),
});
export type HouseholdSummary = z.infer<typeof householdSummarySchema>;

/**
 * 永続化用の招待。token は URL に含めるものであり応答ボディには含めない
 * （previewInvite/createInvite のレスポンスは inviteSchema を直接返さない）。
 */
export const inviteSchema = z.object({
  token: z.string(),
  householdId: z.string(),
  invitedEmail: z.string().email(),
  invitedByUserId: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type Invite = z.infer<typeof inviteSchema>;

export const createInviteInputSchema = z.object({
  email: z.string().email(),
});
export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;

/** GET /invites/{token}（未認証）レスポンス。トークン保持者に見せてよい最小限の情報のみ。 */
export const invitePreviewSchema = z.object({
  householdName: z.string(),
  invitedEmail: z.string().email(),
  invitedByEmail: z.string().email(),
  expiresAt: z.string().datetime(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;
