import { randomUUID } from 'node:crypto';
import {
  createCategoryInputSchema,
  PRESET_CATEGORIES,
  updateCategoryInputSchema,
  type Category,
} from '@household/shared';
import type { CategoryRepository } from '../repository/categoryRepository';
import { NotFoundError } from '../lib/errors';

/**
 * Lists the caller's categories. On a brand-new user (no CATEGORY# items yet), lazily seeds
 * the preset category master (packages/shared PRESET_CATEGORIES) into user-owned items and
 * persists them before returning - see CLAUDE.md: presets are copied on first login, then
 * owned/editable independently of the immutable preset master.
 */
export async function listCategories(
  repository: CategoryRepository,
  userId: string,
): Promise<Category[]> {
  const existing = await repository.listByUser(userId);
  if (existing.length > 0) {
    return existing.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const now = new Date().toISOString();
  const seeded: Category[] = PRESET_CATEGORIES.map((preset, index) => ({
    id: randomUUID(),
    userId,
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
  userId: string,
  rawInput: unknown,
): Promise<Category> {
  const input = createCategoryInputSchema.parse(rawInput);

  // New user-added categories sort after the current list (presets occupy 0..N-1).
  const existing = await repository.listByUser(userId);
  const now = new Date().toISOString();
  const category: Category = {
    id: randomUUID(),
    userId,
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
  userId: string,
  categoryId: string,
  rawInput: unknown,
): Promise<Category> {
  const input = updateCategoryInputSchema.parse(rawInput);

  const existing = await repository.getById(userId, categoryId);
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

export async function deleteCategory(
  repository: CategoryRepository,
  userId: string,
  categoryId: string,
): Promise<void> {
  const existing = await repository.getById(userId, categoryId);
  if (!existing) {
    throw new NotFoundError(`Category ${categoryId} not found`);
  }
  await repository.delete(userId, categoryId);
}
