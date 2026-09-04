import { z } from 'zod';

export const subscriptionFrequencySchema = z.enum(['monthly', 'yearly']);
export type SubscriptionFrequency = z.infer<typeof subscriptionFrequencySchema>;

export const subscriptionSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string().min(1).max(50),
  /** 費目マスタは支出専用のため、常にexpense系の費目を指す */
  categoryId: z.string(),
  /** 想定請求額（円）。取引ダイアログのサジェストで金額の初期値として使う */
  amount: z.number().int().positive(),
  frequency: subscriptionFrequencySchema,
  /**
   * frequency=yearly のときの請求月（1-12）。monthly のときは null。
   * この整合性はzodではなくsubscriptionService.tsのassertBillingScheduleRuleで強制する
   * （transactionのcategoryId/amountと同じ、スキーマは緩め・業務ルールはサービス層という方針）。
   */
  billingMonth: z.number().int().min(1).max(12).nullable(),
  billingDay: z.number().int().min(1).max(31),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const createSubscriptionInputSchema = subscriptionSchema.pick({
  name: true,
  categoryId: true,
  amount: true,
  frequency: true,
  billingMonth: true,
  billingDay: true,
  isActive: true,
});
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionInputSchema>;

export const updateSubscriptionInputSchema = createSubscriptionInputSchema.partial();
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionInputSchema>;
