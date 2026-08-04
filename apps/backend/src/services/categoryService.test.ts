import { describe, expect, it, vi } from 'vitest';
import { PRESET_CATEGORIES } from '@household/shared';
import { ZodError } from 'zod';
import { FakeCategoryRepository } from '../repository/fakeCategoryRepository';
import { createCategory, deleteCategory, listCategories, updateCategory } from './categoryService';
import { NotFoundError } from '../lib/errors';

describe('listCategories', () => {
  it('seeds preset categories on first call for a brand-new user', async () => {
    const repository = new FakeCategoryRepository();

    const categories = await listCategories(repository, 'user-1');

    expect(categories).toHaveLength(PRESET_CATEGORIES.length);
    expect(categories.every((category) => category.isPreset)).toBe(true);
    expect(categories.every((category) => category.householdId === 'user-1')).toBe(true);
    expect(categories.map((category) => category.name)).toEqual(
      PRESET_CATEGORIES.map((preset) => preset.name),
    );
    // Persisted, not just returned in-memory.
    await expect(repository.listByHousehold('user-1')).resolves.toHaveLength(
      PRESET_CATEGORIES.length,
    );
  });

  it('does not reseed presets on a second call', async () => {
    const repository = new FakeCategoryRepository();
    const putAllSpy = vi.spyOn(repository, 'putAll');

    await listCategories(repository, 'user-1');
    expect(putAllSpy).toHaveBeenCalledTimes(1);

    const second = await listCategories(repository, 'user-1');
    expect(putAllSpy).toHaveBeenCalledTimes(1);
    expect(second).toHaveLength(PRESET_CATEGORIES.length);
  });

  it('seeds independently per user', async () => {
    const repository = new FakeCategoryRepository();

    await listCategories(repository, 'user-1');
    const userTwoCategories = await listCategories(repository, 'user-2');

    expect(userTwoCategories).toHaveLength(PRESET_CATEGORIES.length);
    expect(userTwoCategories.every((category) => category.householdId === 'user-2')).toBe(true);
  });
});

describe('createCategory', () => {
  it('rejects invalid input', async () => {
    const repository = new FakeCategoryRepository();

    await expect(createCategory(repository, 'user-1', { type: 'fixed' })).rejects.toThrow(ZodError);
    await expect(repository.listByHousehold('user-1')).resolves.toEqual([]);
  });

  it('rejects a name that is too long', async () => {
    const repository = new FakeCategoryRepository();

    await expect(
      createCategory(repository, 'user-1', { name: 'a'.repeat(51), type: 'variable' }),
    ).rejects.toThrow(ZodError);
  });

  it('creates and persists a user-added category', async () => {
    const repository = new FakeCategoryRepository();

    const category = await createCategory(repository, 'user-1', {
      name: 'ペット費',
      type: 'variable',
      tooltip: 'ペットフード・トリミング代など',
    });

    expect(category.isPreset).toBe(false);
    expect(category.householdId).toBe('user-1');
    await expect(repository.getById('user-1', category.id)).resolves.toEqual(category);
  });
});

describe('updateCategory', () => {
  it('throws NotFoundError for an unknown category', async () => {
    const repository = new FakeCategoryRepository();

    await expect(
      updateCategory(repository, 'user-1', 'missing-id', { name: 'New name' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects invalid input', async () => {
    const repository = new FakeCategoryRepository();
    const category = await createCategory(repository, 'user-1', {
      name: '食費',
      type: 'variable',
    });

    await expect(
      updateCategory(repository, 'user-1', category.id, { type: 'not-a-type' }),
    ).rejects.toThrow(ZodError);
  });

  it('updates only the provided fields and bumps updatedAt', async () => {
    const repository = new FakeCategoryRepository();
    const category = await createCategory(repository, 'user-1', {
      name: '食費',
      type: 'variable',
    });

    const updated = await updateCategory(repository, 'user-1', category.id, {
      name: '食費（改）',
    });

    expect(updated.name).toBe('食費（改）');
    expect(updated.type).toBe('variable');
    expect(updated.id).toBe(category.id);
  });
});

describe('deleteCategory', () => {
  it('throws NotFoundError for an unknown category', async () => {
    const repository = new FakeCategoryRepository();

    await expect(deleteCategory(repository, 'user-1', 'missing-id')).rejects.toThrow(NotFoundError);
  });

  it('deletes an existing category, including preset-origin ones', async () => {
    const repository = new FakeCategoryRepository();
    const [preset] = await listCategories(repository, 'user-1');
    expect(preset).toBeDefined();

    await deleteCategory(repository, 'user-1', preset!.id);

    await expect(repository.getById('user-1', preset!.id)).resolves.toBeUndefined();
  });
});
