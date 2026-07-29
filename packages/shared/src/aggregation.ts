import { z } from 'zod';

export const trendGranularitySchema = z.enum(['day', 'week', 'month', 'year']);
export type TrendGranularity = z.infer<typeof trendGranularitySchema>;

/**
 * period の形式は granularity に応じて '2026-07-24' / '2026-W30' / '2026-07' / '2026'。
 * transfer は資産形成推移（累計）の算出でクライアント側が再利用するためのフィールドであり、
 * 収支推移（income/expense）の集計対象からは変わらず除外される。
 */
export const trendPointSchema = z.object({
  period: z.string(),
  income: z.number(),
  expense: z.number(),
  transfer: z.number(),
});
export type TrendPoint = z.infer<typeof trendPointSchema>;

export const categoryPivotRowSchema = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
  /** period -> 合計金額 */
  amountsByPeriod: z.record(z.string(), z.number()),
});
export type CategoryPivotRow = z.infer<typeof categoryPivotRowSchema>;

export const budgetVarianceRowSchema = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
  budgetAmount: z.number(),
  actualAmount: z.number(),
  /** actualAmount - budgetAmount */
  varianceAmount: z.number(),
});
export type BudgetVarianceRow = z.infer<typeof budgetVarianceRowSchema>;
