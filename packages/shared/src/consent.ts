import { z } from 'zod';

/**
 * 利用規約・プライバシーポリシーの結合バージョン（両者は1つのバージョン文字列で管理する）。
 * 本文（apps/frontend/src/content/legalContent.tsx）を実質的に変更した場合は、
 * 必ずこの値を更新すること。さもないと既存ユーザーに再同意を要求できない。
 * 値はISO日付形式（改定日）を採用。
 */
export const CURRENT_TERMS_VERSION = '2026-07-29';

export const consentStatusSchema = z.object({
  currentVersion: z.string(),
  termsAgreedVersion: z.string().optional(),
  termsAgreedAt: z.string().datetime().optional(),
  mustAgree: z.boolean(),
});
export type ConsentStatus = z.infer<typeof consentStatusSchema>;
