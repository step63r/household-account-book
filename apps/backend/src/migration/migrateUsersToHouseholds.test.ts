import { describe, expect, it } from 'vitest';
import type { User } from '@household/shared';
import { FakeMigrationRepository } from '../repository/fakeMigrationRepository';
import { householdPk, memberSk, userPk } from '../repository/keys';
import { migrateUser, runMigration } from './migrateUsersToHouseholds';

function legacyProfile(overrides: Partial<User> & Pick<User, 'id' | 'email'>): User {
  const now = '2020-01-01T00:00:00.000Z';
  return {
    status: 'active',
    plan: 'free',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('migrateUser', () => {
  it('fully migrates a fresh (never-run) candidate: copies items, backfills createdBy, commits, cleans up', async () => {
    const repository = new FakeMigrationRepository();
    repository.seedUserProfile(legacyProfile({ id: 'user-1', email: 'user1@example.com' }));
    repository.seedUserItem('user-1', 'TXN#2020-01-01#txn-1', {
      id: 'txn-1',
      userId: 'user-1',
      date: '2020-01-01',
      type: 'expense',
      categoryId: 'category-1',
      amount: 1200,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    repository.seedUserItem('user-1', 'CATEGORY#category-1', {
      id: 'category-1',
      userId: 'user-1',
      name: '食費',
      type: 'variable',
      isPreset: true,
      sortOrder: 0,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    repository.seedUserItem('user-1', 'BUDGET#202001#category-1', {
      id: 'budget-1',
      userId: 'user-1',
      yearMonth: '2020-01',
      categoryId: 'category-1',
      amount: 30000,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

    const result = await migrateUser(
      repository,
      'user-1',
      { dryRun: false },
      '2026-08-04T00:00:00.000Z',
    );

    expect(result.status).toBe('migrated');
    expect(result.newHouseholdId).toBeDefined();
    expect(result.copiedItemCount).toBe(3);
    expect(result.deletedOldItemCount).toBe(3);
    expect(result.cleanupFailed).toBe(false);

    const householdId = result.newHouseholdId!;

    // Household PROFILE + MEMBER created.
    expect(repository.getItem(householdPk(householdId), 'PROFILE')).toMatchObject({
      id: householdId,
      name: 'マイ家計',
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    });
    expect(repository.getItem(householdPk(householdId), memberSk('user-1'))).toEqual({
      PK: householdPk(householdId),
      SK: memberSk('user-1'),
      householdId,
      userId: 'user-1',
      joinedAt: '2020-01-01T00:00:00.000Z', // backdated to the user's original createdAt
    });

    // Transaction copied with householdId + backfilled createdBy, userId attribute dropped.
    const copiedTxn = repository.getItem(householdPk(householdId), 'TXN#2020-01-01#txn-1');
    expect(copiedTxn).toMatchObject({
      id: 'txn-1',
      householdId,
      createdBy: 'user-1',
      amount: 1200,
    });
    expect(copiedTxn?.userId).toBeUndefined();

    // Category/budget copied with householdId, no createdBy (not a transaction).
    const copiedCategory = repository.getItem(householdPk(householdId), 'CATEGORY#category-1');
    expect(copiedCategory).toMatchObject({ id: 'category-1', householdId, name: '食費' });
    expect(copiedCategory?.createdBy).toBeUndefined();
    expect(copiedCategory?.userId).toBeUndefined();

    const copiedBudget = repository.getItem(householdPk(householdId), 'BUDGET#202001#category-1');
    expect(copiedBudget).toMatchObject({ id: 'budget-1', householdId, amount: 30000 });

    // Commit: USER#user-1/PROFILE now has householdId.
    const committedProfile = repository.getItem(userPk('user-1'), 'PROFILE');
    expect(committedProfile).toMatchObject({
      id: 'user-1',
      email: 'user1@example.com',
      householdId,
      updatedAt: '2026-08-04T00:00:00.000Z',
    });

    // Cleanup: old TXN/CATEGORY/BUDGET items removed from USER#user-1, but PROFILE remains.
    const remainingUserItems = repository.listItems(userPk('user-1'));
    expect(remainingUserItems).toHaveLength(1);
    expect(remainingUserItems[0]!.SK).toBe('PROFILE');
  });

  it('skips an already-migrated user without writing anything', async () => {
    const repository = new FakeMigrationRepository();
    repository.seedUserProfile(
      legacyProfile({
        id: 'user-1',
        email: 'user1@example.com',
        householdId: 'household-existing',
      }),
    );

    const result = await migrateUser(repository, 'user-1', { dryRun: false });

    expect(result).toEqual({
      userId: 'user-1',
      status: 'alreadyMigrated',
      newHouseholdId: 'household-existing',
      copiedItemCount: 0,
      deletedOldItemCount: 0,
      cleanupFailed: false,
    });
    // Nothing new was written under any household partition.
    expect(repository.listItems(householdPk('household-existing'))).toHaveLength(0);
  });

  it('dry-run performs zero writes', async () => {
    const repository = new FakeMigrationRepository();
    repository.seedUserProfile(legacyProfile({ id: 'user-1', email: 'user1@example.com' }));
    repository.seedUserItem('user-1', 'TXN#2020-01-01#txn-1', {
      id: 'txn-1',
      userId: 'user-1',
      date: '2020-01-01',
      type: 'expense',
      categoryId: 'category-1',
      amount: 1200,
    });

    const result = await migrateUser(repository, 'user-1', { dryRun: true });

    expect(result.status).toBe('dryRun');
    expect(result.newHouseholdId).toBeDefined();
    expect(result.copiedItemCount).toBe(1);
    // Old items untouched.
    expect(repository.listItems(userPk('user-1'))).toHaveLength(2);
    // No household partition was ever written to.
    expect(repository.listItems(householdPk(result.newHouseholdId!))).toHaveLength(0);
    // Profile was not committed.
    expect(repository.getItem(userPk('user-1'), 'PROFILE')).not.toHaveProperty('householdId');
  });

  it('reports missingProfile for a userId with no PROFILE item', async () => {
    const repository = new FakeMigrationRepository();

    const result = await migrateUser(repository, 'ghost-user', { dryRun: false });

    expect(result.status).toBe('missingProfile');
    expect(result.newHouseholdId).toBeUndefined();
  });

  it('a cleanup-phase failure does not prevent the commit from having already succeeded', async () => {
    const repository = new FakeMigrationRepository();
    repository.seedUserProfile(legacyProfile({ id: 'user-1', email: 'user1@example.com' }));
    repository.seedUserItem('user-1', 'TXN#2020-01-01#txn-1', {
      id: 'txn-1',
      userId: 'user-1',
      date: '2020-01-01',
      type: 'expense',
      categoryId: 'category-1',
      amount: 1200,
    });
    repository.failCleanupFor('user-1');

    const result = await migrateUser(
      repository,
      'user-1',
      { dryRun: false },
      '2026-08-04T00:00:00.000Z',
    );

    expect(result.status).toBe('migrated');
    expect(result.cleanupFailed).toBe(true);
    expect(result.deletedOldItemCount).toBe(0);

    // Commit already happened despite the cleanup failure.
    expect(repository.getItem(userPk('user-1'), 'PROFILE')).toMatchObject({
      householdId: result.newHouseholdId,
    });
    // Copy phase also already happened.
    expect(
      repository.getItem(householdPk(result.newHouseholdId!), 'TXN#2020-01-01#txn-1'),
    ).toMatchObject({ createdBy: 'user-1' });
    // Old item is left behind as a harmless orphan (cleanup failed).
    expect(repository.getItem(userPk('user-1'), 'TXN#2020-01-01#txn-1')).toBeDefined();
  });
});

describe('runMigration', () => {
  it('migrates every unmigrated candidate found by the scan', async () => {
    const repository = new FakeMigrationRepository();
    repository.seedUserProfile(legacyProfile({ id: 'user-1', email: 'user1@example.com' }));
    repository.seedUserProfile(legacyProfile({ id: 'user-2', email: 'user2@example.com' }));
    repository.seedUserProfile(
      legacyProfile({ id: 'user-3', email: 'user3@example.com', householdId: 'already-migrated' }),
    );

    const results = await runMigration(repository, { dryRun: false });

    expect(results.map((r) => r.userId).sort()).toEqual(['user-1', 'user-2']);
    expect(results.every((r) => r.status === 'migrated')).toBe(true);
  });

  it('restricts to exactly one user when --user-id is given, bypassing the scan', async () => {
    const repository = new FakeMigrationRepository();
    repository.seedUserProfile(legacyProfile({ id: 'user-1', email: 'user1@example.com' }));
    repository.seedUserProfile(legacyProfile({ id: 'user-2', email: 'user2@example.com' }));

    const results = await runMigration(repository, { dryRun: false, userId: 'user-1' });

    expect(results).toHaveLength(1);
    expect(results[0]!.userId).toBe('user-1');
    expect(results[0]!.status).toBe('migrated');
    // user-2 must remain untouched.
    expect(repository.getItem(userPk('user-2'), 'PROFILE')).not.toHaveProperty('householdId');
  });

  it('--user-id targeting an already-migrated user is a safe no-op', async () => {
    const repository = new FakeMigrationRepository();
    repository.seedUserProfile(
      legacyProfile({
        id: 'user-1',
        email: 'user1@example.com',
        householdId: 'household-existing',
      }),
    );

    const results = await runMigration(repository, { dryRun: false, userId: 'user-1' });

    expect(results).toEqual([
      {
        userId: 'user-1',
        status: 'alreadyMigrated',
        newHouseholdId: 'household-existing',
        copiedItemCount: 0,
        deletedOldItemCount: 0,
        cleanupFailed: false,
      },
    ]);
  });
});
