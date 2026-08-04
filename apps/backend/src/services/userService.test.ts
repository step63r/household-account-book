import { describe, expect, it } from 'vitest';
import { CURRENT_TERMS_VERSION, type User } from '@household/shared';
import { FakeHouseholdRepository } from '../repository/fakeHouseholdRepository';
import { FakeUserRepository } from '../repository/fakeUserRepository';
import { HttpError } from '../lib/errors';
import {
  ensureProfileWithHousehold,
  getConsentStatus,
  getMyProfile,
  getUserContext,
  recordConsent,
  requestWithdrawal,
} from './userService';

/** Simulates a PROFILE item written before the `plan`/`householdId` fields existed (DynamoDB is
 * schemaless, so such legacy items are still readable at runtime even though those fields are
 * now required/present on the `User` type) - the same cast pattern each pre-existing "legacy
 * record" test below uses. */
function legacyProfile(overrides: Omit<User, 'plan' | 'householdId'>): User {
  return overrides as User;
}

describe('requestWithdrawal', () => {
  it('creates a pendingDeletion profile with deletionScheduledAt 30 days out', async () => {
    const repository = new FakeUserRepository();

    const user = await requestWithdrawal(repository, 'user-1', 'user1@example.com');

    expect(user.status).toBe('pendingDeletion');
    expect(user.email).toBe('user1@example.com');
    expect(user.deletionRequestedAt).toBeDefined();
    expect(user.deletionScheduledAt).toBeDefined();
    const requestedAt = new Date(user.deletionRequestedAt!).getTime();
    const scheduledAt = new Date(user.deletionScheduledAt!).getTime();
    expect(scheduledAt - requestedAt).toBe(30 * 24 * 60 * 60 * 1000);
    await expect(repository.getProfile('user-1')).resolves.toEqual(user);
  });

  it('is idempotent - a second request does not extend deletionScheduledAt', async () => {
    const repository = new FakeUserRepository();

    const first = await requestWithdrawal(repository, 'user-1', 'user1@example.com');
    const second = await requestWithdrawal(repository, 'user-1', 'user1@example.com');

    expect(second).toEqual(first);
  });

  it('preserves the original createdAt across the status transition', async () => {
    const repository = new FakeUserRepository();
    await repository.put(
      legacyProfile({
        id: 'user-1',
        email: 'user1@example.com',
        status: 'active',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      }),
    );

    const user = await requestWithdrawal(repository, 'user-1', 'user1@example.com');

    expect(user.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(user.status).toBe('pendingDeletion');
  });

  it('preserves an existing householdId across the status transition', async () => {
    const repository = new FakeUserRepository();
    await repository.put({
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
      plan: 'free',
      householdId: 'household-1',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

    const user = await requestWithdrawal(repository, 'user-1', 'user1@example.com');

    expect(user.householdId).toBe('household-1');
  });

  it('scopes profiles per user', async () => {
    const repository = new FakeUserRepository();

    await requestWithdrawal(repository, 'user-1', 'user1@example.com');

    await expect(repository.getProfile('user-2')).resolves.toBeUndefined();
  });
});

describe('ensureProfileWithHousehold', () => {
  it('bootstraps a new household for a brand-new user', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();

    const user = await ensureProfileWithHousehold(
      userRepository,
      householdRepository,
      'user-1',
      'user1@example.com',
    );

    expect(user.householdId).toBeDefined();
    await expect(householdRepository.getProfile(user.householdId!)).resolves.toMatchObject({
      name: 'マイ家計',
    });
    await expect(householdRepository.listMembers(user.householdId!)).resolves.toEqual([
      { householdId: user.householdId, userId: 'user-1', joinedAt: user.createdAt },
    ]);
    await expect(userRepository.getProfile('user-1')).resolves.toEqual(user);
  });

  it('passes an already-migrated profile through unchanged', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();
    const existing: User = {
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
      plan: 'paid',
      householdId: 'household-1',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    await userRepository.put(existing);

    const user = await ensureProfileWithHousehold(
      userRepository,
      householdRepository,
      'user-1',
      'user1@example.com',
    );

    expect(user).toEqual(existing);
    // No new household should have been bootstrapped.
    await expect(householdRepository.getProfile('household-1')).resolves.toBeUndefined();
  });

  it('fails loudly (503) for a legacy profile with no householdId yet', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();
    await userRepository.put(
      legacyProfile({
        id: 'user-1',
        email: 'user1@example.com',
        status: 'active',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      }),
    );

    await expect(
      ensureProfileWithHousehold(
        userRepository,
        householdRepository,
        'user-1',
        'user1@example.com',
      ),
    ).rejects.toThrow(HttpError);
    await expect(
      ensureProfileWithHousehold(
        userRepository,
        householdRepository,
        'user-1',
        'user1@example.com',
      ),
    ).rejects.toMatchObject({ statusCode: 503, code: 'HOUSEHOLD_MIGRATION_PENDING' });
  });
});

describe('getUserContext', () => {
  it('returns plan and householdId for a brand-new user', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();

    const context = await getUserContext(
      userRepository,
      householdRepository,
      'user-1',
      'user1@example.com',
    );

    expect(context.plan).toBe('free');
    expect(context.householdId).toBeDefined();
  });

  it('returns the stored plan and householdId for an existing profile', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();
    await userRepository.put({
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
      plan: 'paid',
      householdId: 'household-1',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

    const context = await getUserContext(
      userRepository,
      householdRepository,
      'user-1',
      'user1@example.com',
    );

    expect(context).toEqual({ plan: 'paid', householdId: 'household-1' });
  });
});

describe('getConsentStatus', () => {
  it('lazily creates a profile and reports mustAgree for a brand-new user', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();

    const status = await getConsentStatus(
      userRepository,
      householdRepository,
      'user-1',
      'user1@example.com',
    );

    expect(status.currentVersion).toBe(CURRENT_TERMS_VERSION);
    expect(status.termsAgreedVersion).toBeUndefined();
    expect(status.mustAgree).toBe(true);
    await expect(userRepository.getProfile('user-1')).resolves.toMatchObject({
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
    });
  });

  it('reports mustAgree: false when the stored version matches the current version', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();
    await userRepository.put({
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
      plan: 'free',
      householdId: 'household-1',
      termsAgreedVersion: CURRENT_TERMS_VERSION,
      termsAgreedAt: '2020-01-01T00:00:00.000Z',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

    const status = await getConsentStatus(
      userRepository,
      householdRepository,
      'user-1',
      'user1@example.com',
    );

    expect(status.mustAgree).toBe(false);
  });

  it('reports mustAgree: true when the stored version is stale', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();
    await userRepository.put({
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
      plan: 'free',
      householdId: 'household-1',
      termsAgreedVersion: '2020-01-01',
      termsAgreedAt: '2020-01-01T00:00:00.000Z',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

    const status = await getConsentStatus(
      userRepository,
      householdRepository,
      'user-1',
      'user1@example.com',
    );

    expect(status.mustAgree).toBe(true);
    expect(status.termsAgreedVersion).toBe('2020-01-01');
  });
});

describe('recordConsent', () => {
  it('stamps CURRENT_TERMS_VERSION and termsAgreedAt, lazily creating a profile if none exists', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();

    const status = await recordConsent(
      userRepository,
      householdRepository,
      'user-1',
      'user1@example.com',
    );

    expect(status.termsAgreedVersion).toBe(CURRENT_TERMS_VERSION);
    expect(status.termsAgreedAt).toBeDefined();
    expect(status.mustAgree).toBe(false);
    await expect(userRepository.getProfile('user-1')).resolves.toMatchObject({
      id: 'user-1',
      email: 'user1@example.com',
      termsAgreedVersion: CURRENT_TERMS_VERSION,
    });
  });

  it('preserves existing profile fields (createdAt, status) when recording consent', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();
    await userRepository.put({
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
      plan: 'free',
      householdId: 'household-1',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

    const status = await recordConsent(
      userRepository,
      householdRepository,
      'user-1',
      'user1@example.com',
    );

    expect(status.termsAgreedVersion).toBe(CURRENT_TERMS_VERSION);
    await expect(userRepository.getProfile('user-1')).resolves.toMatchObject({
      createdAt: '2020-01-01T00:00:00.000Z',
      status: 'active',
    });
  });

  it('scopes profiles per user', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();

    await recordConsent(userRepository, householdRepository, 'user-1', 'user1@example.com');

    await expect(userRepository.getProfile('user-2')).resolves.toBeUndefined();
  });
});

describe('getMyProfile', () => {
  it('lazily creates a profile with plan: free for a brand-new user', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();

    const profile = await getMyProfile(
      userRepository,
      householdRepository,
      'user-1',
      'user1@example.com',
    );

    expect(profile).toEqual({ plan: 'free' });
    await expect(userRepository.getProfile('user-1')).resolves.toMatchObject({
      id: 'user-1',
      email: 'user1@example.com',
      plan: 'free',
    });
  });

  it('returns the stored plan for an existing profile without mutating it', async () => {
    const userRepository = new FakeUserRepository();
    const householdRepository = new FakeHouseholdRepository();
    await userRepository.put({
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
      plan: 'paid',
      householdId: 'household-1',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

    const profile = await getMyProfile(
      userRepository,
      householdRepository,
      'user-1',
      'user1@example.com',
    );

    expect(profile).toEqual({ plan: 'paid' });
  });
});
