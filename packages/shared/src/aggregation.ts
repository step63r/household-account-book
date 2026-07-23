import { z } from 'zod';

export const trendGranularitySchema = z.enum(['day', 'week', 'month']);
export type TrendGranularity = z.infer<typeof trendGranularitySchema>;

/** period の形式は granularity に応じて '2026-07-24' / '2026-W30' / '2026-07' */
export const trendPointSchema = z.object({
  period: z.string(),
  income: z.number(),
  expense: z.number(),
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
