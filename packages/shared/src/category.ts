import { z } from 'zod';

export const categoryTypeSchema = z.enum(['fixed', 'variable']);
export type CategoryType = z.infer<typeof categoryTypeSchema>;

export const categorySchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string().min(1).max(50),
  type: categoryTypeSchema,
  /** ツールチップ表示用の補足説明（例: 「家賃、住宅ローン、管理費など」） */
  tooltip: z.string().max(200).optional(),
  /** プリセット由来かどうか。true でもユーザー所有データとして独立して編集・削除できる */
  isPreset: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategoryInputSchema = categorySchema.pick({
  name: true,
  type: true,
  tooltip: true,
});
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const updateCategoryInputSchema = createCategoryInputSchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;
