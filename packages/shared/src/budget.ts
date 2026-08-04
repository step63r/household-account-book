import { z } from 'zod';

/** YYYY-MM */
export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export type YearMonth = z.infer<typeof yearMonthSchema>;

export const budgetSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  yearMonth: yearMonthSchema,
  categoryId: z.string(),
  /** 円単位の整数 */
  amount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Budget = z.infer<typeof budgetSchema>;

export const upsertBudgetInputSchema = budgetSchema.pick({
  yearMonth: true,
  categoryId: true,
  amount: true,
});
export type UpsertBudgetInput = z.infer<typeof upsertBudgetInputSchema>;
