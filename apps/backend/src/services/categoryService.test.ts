import { describe, expect, it, vi } from 'vitest';
import { PRESET_CATEGORIES } from '@household/shared';
import { ZodError } from 'zod';
import { FakeCategoryRepository } from '../repository/fakeCategoryRepository';
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from './categoryService';
import { HttpError, NotFoundError } from '../lib/errors';

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

describe('reorderCategories', () => {
  it('reorders one type only, leaving the other type untouched', async () => {
    const repository = new FakeCategoryRepository();
    const fixedA = await createCategory(repository, 'user-1', { name: '固定A', type: 'fixed' });
    const fixedB = await createCategory(repository, 'user-1', { name: '固定B', type: 'fixed' });
    const variableA = await createCategory(repository, 'user-1', {
      name: '変動A',
      type: 'variable',
    });
    const variableB = await createCategory(repository, 'user-1', {
      name: '変動B',
      type: 'variable',
    });

    const result = await reorderCategories(repository, 'user-1', {
      type: 'fixed',
      orderedIds: [fixedB.id, fixedA.id],
    });

    expect(result.map((c) => c.id)).toEqual([fixedB.id, fixedA.id]);
    expect(result.map((c) => c.sortOrder)).toEqual([0, 1]);

    const persistedVariableA = await repository.getById('user-1', variableA.id);
    const persistedVariableB = await repository.getById('user-1', variableB.id);
    expect(persistedVariableA?.sortOrder).toBe(variableA.sortOrder);
    expect(persistedVariableB?.sortOrder).toBe(variableB.sortOrder);
  });

  it('returns the categories reflecting new sortOrder values matching orderedIds order', async () => {
    const repository = new FakeCategoryRepository();
    const a = await createCategory(repository, 'user-1', { name: 'A', type: 'variable' });
    const b = await createCategory(repository, 'user-1', { name: 'B', type: 'variable' });
    const c = await createCategory(repository, 'user-1', { name: 'C', type: 'variable' });

    const result = await reorderCategories(repository, 'user-1', {
      type: 'variable',
      orderedIds: [c.id, a.id, b.id],
    });

    expect(result.map((category) => category.id)).toEqual([c.id, a.id, b.id]);
    expect(result.map((category) => category.sortOrder)).toEqual([0, 1, 2]);

    const persisted = await repository.listByHousehold('user-1');
    expect(persisted.find((category) => category.id === c.id)?.sortOrder).toBe(0);
    expect(persisted.find((category) => category.id === a.id)?.sortOrder).toBe(1);
    expect(persisted.find((category) => category.id === b.id)?.sortOrder).toBe(2);
  });

  it('rejects when orderedIds is missing an existing id', async () => {
    const repository = new FakeCategoryRepository();
    const a = await createCategory(repository, 'user-1', { name: 'A', type: 'variable' });
    await createCategory(repository, 'user-1', { name: 'B', type: 'variable' });

    await expect(
      reorderCategories(repository, 'user-1', { type: 'variable', orderedIds: [a.id] }),
    ).rejects.toThrow(HttpError);
  });

  it('rejects when orderedIds contains a foreign/extra id', async () => {
    const repository = new FakeCategoryRepository();
    const a = await createCategory(repository, 'user-1', { name: 'A', type: 'variable' });
    const b = await createCategory(repository, 'user-1', { name: 'B', type: 'variable' });

    await expect(
      reorderCategories(repository, 'user-1', {
        type: 'variable',
        orderedIds: [a.id, b.id, 'unknown-id'],
      }),
    ).rejects.toThrow(HttpError);
  });

  it('rejects when orderedIds contains a duplicate id', async () => {
    const repository = new FakeCategoryRepository();
    const a = await createCategory(repository, 'user-1', { name: 'A', type: 'variable' });
    const b = await createCategory(repository, 'user-1', { name: 'B', type: 'variable' });

    await expect(
      reorderCategories(repository, 'user-1', {
        type: 'variable',
        orderedIds: [a.id, a.id, b.id],
      }),
    ).rejects.toThrow(HttpError);
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
