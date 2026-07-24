import { describe, expect, it } from 'vitest';
import { FakeUserRepository } from '../repository/fakeUserRepository';
import { requestWithdrawal } from './userService';

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
    await repository.put({
      id: 'user-1',
      email: 'user1@example.com',
      status: 'active',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });

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
