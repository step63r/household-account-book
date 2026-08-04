import { describe, expect, it } from 'vitest';
import type { Household } from '@household/shared';
import { NotFoundError } from '../lib/errors';
import { FakeHouseholdRepository } from '../repository/fakeHouseholdRepository';
import { updateHouseholdName } from './householdService';

function buildHousehold(overrides: Partial<Household> = {}): Household {
  return {
    id: 'household-1',
    name: 'マイ家計',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('updateHouseholdName', () => {
  it('updates the household name and bumps updatedAt', async () => {
    const repository = new FakeHouseholdRepository();
    await repository.putProfile(buildHousehold());

    const updated = await updateHouseholdName(repository, 'household-1', { name: '田中家' });

    expect(updated.name).toBe('田中家');
    expect(updated.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
    await expect(repository.getProfile('household-1')).resolves.toMatchObject({
      name: '田中家',
    });
  });

  it('throws NotFoundError when the household does not exist', async () => {
    const repository = new FakeHouseholdRepository();

    await expect(
      updateHouseholdName(repository, 'missing-household', { name: '田中家' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an empty name', async () => {
    const repository = new FakeHouseholdRepository();
    await repository.putProfile(buildHousehold());

    await expect(updateHouseholdName(repository, 'household-1', { name: '' })).rejects.toThrow();
  });

  it('rejects a name longer than 50 characters', async () => {
    const repository = new FakeHouseholdRepository();
    await repository.putProfile(buildHousehold());

    await expect(
      updateHouseholdName(repository, 'household-1', { name: 'あ'.repeat(51) }),
    ).rejects.toThrow();
  });
});
