import { randomUUID } from 'node:crypto';
import {
  createCategoryInputSchema,
  PRESET_CATEGORIES,
  reorderCategoriesInputSchema,
  updateCategoryInputSchema,
  type Category,
} from '@household/shared';
import type { CategoryRepository } from '../repository/categoryRepository';
import { HttpError, NotFoundError } from '../lib/errors';

/**
 * 世帯の費目を一覧する。費目未作成（新規世帯）の場合、プリセット費目マスタ
 * （packages/shared PRESET_CATEGORIES）を世帯所有アイテムとして遅延投入して保存する -
 * CLAUDE.md参照: プリセットは初回登録時にコピーし、以後は独立して所有・編集できる。
 */
export async function listCategories(
  repository: CategoryRepository,
  householdId: string,
): Promise<Category[]> {
  const existing = await repository.listByHousehold(householdId);
  if (existing.length > 0) {
    return existing.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const now = new Date().toISOString();
  const seeded: Category[] = PRESET_CATEGORIES.map((preset, index) => ({
    id: randomUUID(),
    householdId,
    name: preset.name,
    type: preset.type,
    tooltip: preset.tooltip,
    isPreset: true,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
  }));
  await repository.putAll(seeded);
  return seeded;
}

export async function createCategory(
  repository: CategoryRepository,
  householdId: string,
  rawInput: unknown,
): Promise<Category> {
  const input = createCategoryInputSchema.parse(rawInput);

  // New user-added categories sort after the current list (presets occupy 0..N-1).
  const existing = await repository.listByHousehold(householdId);
  const now = new Date().toISOString();
  const category: Category = {
    id: randomUUID(),
    householdId,
    name: input.name,
    type: input.type,
    tooltip: input.tooltip,
    isPreset: false,
    sortOrder: existing.length,
    createdAt: now,
    updatedAt: now,
  };
  await repository.put(category);
  return category;
}

export async function updateCategory(
  repository: CategoryRepository,
  householdId: string,
  categoryId: string,
  rawInput: unknown,
): Promise<Category> {
  const input = updateCategoryInputSchema.parse(rawInput);

  const existing = await repository.getById(householdId, categoryId);
  if (!existing) {
    throw new NotFoundError(`Category ${categoryId} not found`);
  }

  const updated: Category = {
    ...existing,
    ...input,
    updatedAt: new Date().toISOString(),
  };
  await repository.put(updated);
  return updated;
}

/**
 * 費目の並び替え（固定費・変動費を区別せず世帯の費目全体で1つの順序）。orderedIdsとDB上の
 * 費目集合が完全に一致することを検証してから、orderedIdsの並び順で0始まりのsortOrderを
 * 振り直す。一部だけ適用することはない（検証を先に済ませてから書き込む）。
 */
export async function reorderCategories(
  repository: CategoryRepository,
  householdId: string,
  rawInput: unknown,
): Promise<Category[]> {
  const input = reorderCategoriesInputSchema.parse(rawInput);

  const existing = await repository.listByHousehold(householdId);

  const orderedIdSet = new Set(input.orderedIds);
  if (orderedIdSet.size !== input.orderedIds.length) {
    throw new HttpError(400, 'orderedIds contains duplicate ids');
  }
  const existingIdSet = new Set(existing.map((c) => c.id));
  if (orderedIdSet.size !== existingIdSet.size) {
    throw new HttpError(400, 'orderedIds does not match the existing category set');
  }
  for (const id of input.orderedIds) {
    if (!existingIdSet.has(id)) {
      throw new HttpError(400, `orderedIds contains unknown category id: ${id}`);
    }
  }

  const byId = new Map(existing.map((c) => [c.id, c]));
  const now = new Date().toISOString();
  const updated: Category[] = input.orderedIds.map((id, index) => ({
    ...byId.get(id)!,
    sortOrder: index,
    updatedAt: now,
  }));

  await repository.putAll(updated);
  return updated;
}

export async function deleteCategory(
  repository: CategoryRepository,
  householdId: string,
  categoryId: string,
): Promise<void> {
  const existing = await repository.getById(householdId, categoryId);
  if (!existing) {
    throw new NotFoundError(`Category ${categoryId} not found`);
  }
  await repository.delete(householdId, categoryId);
}
