import { z } from 'zod';

/**
 * income/expense は通常の収支。transfer は積立・投資・保険（貯蓄型）・NISA拠出などの
 * 資産振替で、収支推移・予実差の集計からは常に除外する。
 */
export const transactionTypeSchema = z.enum(['income', 'expense', 'transfer']);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const transactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  /** YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: transactionTypeSchema,
  /** transfer では未設定でもよい */
  categoryId: z.string().nullable(),
  /** 円単位の整数 */
  amount: z.number().int().positive(),
  /** 摘要 */
  memo: z.string().max(200).optional(),
  /** type=transfer のときの積立先ラベル（例: NISA、生命保険、財形貯蓄） */
  transferLabel: z.string().max(50).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const createTransactionInputSchema = transactionSchema.pick({
  date: true,
  type: true,
  categoryId: true,
  amount: true,
  memo: true,
  transferLabel: true,
});
export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;

export const updateTransactionInputSchema = createTransactionInputSchema.partial();
export type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>;
