import { describe, expect, it } from 'vitest';
import { FakeHouseholdRepository } from '../repository/fakeHouseholdRepository';
import { FakeUserDeletionRepository } from '../repository/fakeUserDeletionRepository';
import { runWithdrawalDeletionBatch } from './withdrawalBatchService';

describe('runWithdrawalDeletionBatch', () => {
  it('does nothing and returns empty arrays when there are no candidates', async () => {
    const userDeletionRepository = new FakeUserDeletionRepository();
    const householdRepository = new FakeHouseholdRepository();

    const result = await runWithdrawalDeletionBatch(
      userDeletionRepository,
      householdRepository,
      new Date('2026-08-03T00:00:00.000Z'),
    );

    expect(result).toEqual({ processedUserIds: [], failedUserIds: [] });
  });

  it('deletes only the profile + membership for a migrated user when other members remain', async () => {
    const userDeletionRepository = new FakeUserDeletionRepository();
    const householdRepository = new FakeHouseholdRepository();
    userDeletionRepository.addCandidate('user-1', '2026-07-01T00:00:00.000Z');
    userDeletionRepository.setHouseholdId('user-1', 'household-1');
    await householdRepository.putProfile({
      id: 'household-1',
      name: 'マイ家計',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await householdRepository.putMember({
      householdId: 'household-1',
      userId: 'user-1',
      joinedAt: '2026-01-01T00:00:00.000Z',
    });
    await householdRepository.putMember({
      householdId: 'household-1',
      userId: 'user-2',
      joinedAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await runWithdrawalDeletionBatch(
      userDeletionRepository,
      householdRepository,
      new Date('2026-08-03T00:00:00.000Z'),
    );

    expect(result).toEqual({ processedUserIds: ['user-1'], failedUserIds: [] });
    expect(userDeletionRepository.profileExistsFor('user-1')).toBe(false);
    // The household itself, and the remaining member, must survive.
    await expect(householdRepository.getProfile('household-1')).resolves.toBeDefined();
    await expect(householdRepository.listMembers('household-1')).resolves.toEqual([
      { householdId: 'household-1', userId: 'user-2', joinedAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('cascade-deletes the whole household when the last member withdraws', async () => {
    const userDeletionRepository = new FakeUserDeletionRepository();
    const householdRepository = new FakeHouseholdRepository();
    userDeletionRepository.addCandidate('user-1', '2026-07-01T00:00:00.000Z');
    userDeletionRepository.setHouseholdId('user-1', 'household-1');
    await householdRepository.putProfile({
      id: 'household-1',
      name: 'マイ家計',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await householdRepository.putMember({
      householdId: 'household-1',
      userId: 'user-1',
      joinedAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await runWithdrawalDeletionBatch(
      userDeletionRepository,
      householdRepository,
      new Date('2026-08-03T00:00:00.000Z'),
    );

    expect(result).toEqual({ processedUserIds: ['user-1'], failedUserIds: [] });
    expect(userDeletionRepository.profileExistsFor('user-1')).toBe(false);
    await expect(householdRepository.getProfile('household-1')).resolves.toBeUndefined();
  });

  it('falls back to deleting legacy items directly for an un-migrated user (no householdId)', async () => {
    const userDeletionRepository = new FakeUserDeletionRepository();
    const householdRepository = new FakeHouseholdRepository();
    userDeletionRepository.addCandidate('user-legacy', '2026-07-01T00:00:00.000Z');
    userDeletionRepository.seedLegacyItems('user-legacy', [
      { SK: 'TXN#2026-01-01#txn-1' },
      { SK: 'CATEGORY#food' },
      { SK: 'BUDGET#202601#food' },
    ]);

    const result = await runWithdrawalDeletionBatch(
      userDeletionRepository,
      householdRepository,
      new Date('2026-08-03T00:00:00.000Z'),
    );

    expect(result).toEqual({ processedUserIds: ['user-legacy'], failedUserIds: [] });
    expect(userDeletionRepository.profileExistsFor('user-legacy')).toBe(false);
    expect(userDeletionRepository.legacyItemCountFor('user-legacy')).toBe(0);
  });

  it('excludes active users and users whose grace period has not elapsed yet', async () => {
    const userDeletionRepository = new FakeUserDeletionRepository();
    const householdRepository = new FakeHouseholdRepository();
    // Only findCandidates is exercised for this one - an "active" user or one with a future
    // deletionScheduledAt would never be returned by the real Scan filter, so we simply don't
    // register it as a candidate here (mirrors what the Scan's FilterExpression excludes).
    userDeletionRepository.addCandidate('user-future', '2099-01-01T00:00:00.000Z');

    const result = await runWithdrawalDeletionBatch(
      userDeletionRepository,
      householdRepository,
      new Date('2026-08-03T00:00:00.000Z'),
    );

    expect(result).toEqual({ processedUserIds: [], failedUserIds: [] });
    expect(userDeletionRepository.profileExistsFor('user-future')).toBe(true);
  });

  it('records a failed user without stopping the batch for other candidates', async () => {
    const userDeletionRepository = new FakeUserDeletionRepository({ failingUserIds: ['user-bad'] });
    const householdRepository = new FakeHouseholdRepository();
    userDeletionRepository.addCandidate('user-bad', '2026-07-01T00:00:00.000Z');
    userDeletionRepository.addCandidate('user-good', '2026-07-15T00:00:00.000Z');
    userDeletionRepository.seedLegacyItems('user-good', [{ SK: 'TXN#2026-01-01#txn-1' }]);

    const result = await runWithdrawalDeletionBatch(
      userDeletionRepository,
      householdRepository,
      new Date('2026-08-03T00:00:00.000Z'),
    );

    expect(result.processedUserIds).toEqual(['user-good']);
    expect(result.failedUserIds).toEqual(['user-bad']);
    // The failed user's profile is left in place (deleteUserProfile threw before clearing it).
    expect(userDeletionRepository.profileExistsFor('user-bad')).toBe(true);
    expect(userDeletionRepository.profileExistsFor('user-good')).toBe(false);
    expect(userDeletionRepository.legacyItemCountFor('user-good')).toBe(0);
  });
});
