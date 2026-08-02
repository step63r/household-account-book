import { describe, expect, it } from 'vitest';
import { CURRENT_TERMS_VERSION, type User } from '@household/shared';
import { FakeUserRepository } from '../repository/fakeUserRepository';
import { getConsentStatus, getMyProfile, getUserPlan, recordConsent, requestWithdrawal } from './userService';

/** Simulates a PROFILE item written before the `plan` field existed (DynamoDB is schemaless,
 * so such legacy items are still readable at runtime even though `plan` is now required by
 * the `User` type) - the same cast pattern each pre-existing "legacy record" test below uses. */
function legacyProfile(overrides: Omit<User, 'plan'>): User {
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

  it('scopes profiles per user', async () => {
    const repository = new FakeUserRepository();

    await requestWithdrawal(repository, 'user-1', 'user1@example.com');

    await expect(repository.getProfile('user-2')).resolves.toBeUndefined();
  });
});

describe('getConsentStatus', () => {
  it('lazily creates a profile and reports mustAgree for a brand-new user', async () => {
    const repository = new FakeUserRepository();

    const status = await getConsentStatus(repository, 'user-1', 'user1@example.com');

    expect(status.currentVersion).toBe(CURRENT_TERMS_VERSION);
    expect(status.termsAgreedVersion).toBeUndefined();
    expect(status.mustAgree).toBe(true);
    await expect(repository.getProfile('user-1')).resolves.toMatchObject({
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
    });
  });

  it('reports mustAgree: false when the stored version matches the current version', async () => {
    const repository = new FakeUserRepository();
    await repository.put(
      legacyProfile({
        id: 'user-1',
        email: 'user1@example.com',
        status: 'active',
        termsAgreedVersion: CURRENT_TERMS_VERSION,
        termsAgreedAt: '2020-01-01T00:00:00.000Z',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      }),
    );

    const status = await getConsentStatus(repository, 'user-1', 'user1@example.com');

    expect(status.mustAgree).toBe(false);
  });

  it('reports mustAgree: true when the stored version is stale', async () => {
    const repository = new FakeUserRepository();
    await repository.put(
      legacyProfile({
        id: 'user-1',
        email: 'user1@example.com',
        status: 'active',
        termsAgreedVersion: '2020-01-01',
        termsAgreedAt: '2020-01-01T00:00:00.000Z',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      }),
    );

    const status = await getConsentStatus(repository, 'user-1', 'user1@example.com');

    expect(status.mustAgree).toBe(true);
    expect(status.termsAgreedVersion).toBe('2020-01-01');
  });
});

describe('recordConsent', () => {
  it('stamps CURRENT_TERMS_VERSION and termsAgreedAt, lazily creating a profile if none exists', async () => {
    const repository = new FakeUserRepository();

    const status = await recordConsent(repository, 'user-1', 'user1@example.com');

    expect(status.termsAgreedVersion).toBe(CURRENT_TERMS_VERSION);
    expect(status.termsAgreedAt).toBeDefined();
    expect(status.mustAgree).toBe(false);
    await expect(repository.getProfile('user-1')).resolves.toMatchObject({
      id: 'user-1',
      email: 'user1@example.com',
      termsAgreedVersion: CURRENT_TERMS_VERSION,
    });
  });

  it('preserves existing profile fields (createdAt, status) when recording consent', async () => {
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

    const status = await recordConsent(repository, 'user-1', 'user1@example.com');

    expect(status.termsAgreedVersion).toBe(CURRENT_TERMS_VERSION);
    await expect(repository.getProfile('user-1')).resolves.toMatchObject({
      createdAt: '2020-01-01T00:00:00.000Z',
      status: 'active',
    });
  });

  it('scopes profiles per user', async () => {
    const repository = new FakeUserRepository();

    await recordConsent(repository, 'user-1', 'user1@example.com');

    await expect(repository.getProfile('user-2')).resolves.toBeUndefined();
  });
});

describe('getUserPlan', () => {
  it('returns free for a user with no PROFILE item yet', async () => {
    const repository = new FakeUserRepository();

    await expect(getUserPlan(repository, 'user-1')).resolves.toBe('free');
  });

  it('returns free for a legacy PROFILE item written before the plan field existed', async () => {
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

    await expect(getUserPlan(repository, 'user-1')).resolves.toBe('free');
  });

  it('returns the stored plan for an existing profile', async () => {
    const repository = new FakeUserRepository();
    await repository.put({
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
      plan: 'paid',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

    await expect(getUserPlan(repository, 'user-1')).resolves.toBe('paid');
  });
});

describe('getMyProfile', () => {
  it('lazily creates a profile with plan: free for a brand-new user', async () => {
    const repository = new FakeUserRepository();

    const profile = await getMyProfile(repository, 'user-1', 'user1@example.com');

    expect(profile).toEqual({ plan: 'free' });
    await expect(repository.getProfile('user-1')).resolves.toMatchObject({
      id: 'user-1',
      email: 'user1@example.com',
      plan: 'free',
    });
  });

  it('returns the stored plan for an existing profile without mutating it', async () => {
    const repository = new FakeUserRepository();
    await repository.put({
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
      plan: 'paid',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

    const profile = await getMyProfile(repository, 'user-1', 'user1@example.com');

    expect(profile).toEqual({ plan: 'paid' });
  });

  it('defaults a legacy profile missing the plan field to free', async () => {
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

    const profile = await getMyProfile(repository, 'user-1', 'user1@example.com');

    expect(profile).toEqual({ plan: 'free' });
  });
});
