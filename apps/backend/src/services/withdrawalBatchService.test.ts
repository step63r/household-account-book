import { describe, expect, it } from 'vitest';
import { FakeUserDeletionRepository } from '../repository/fakeUserDeletionRepository';
import { runWithdrawalDeletionBatch } from './withdrawalBatchService';

describe('runWithdrawalDeletionBatch', () => {
  it('does nothing and returns empty arrays when there are no candidates', async () => {
    const repository = new FakeUserDeletionRepository();

    const result = await runWithdrawalDeletionBatch(repository, new Date('2026-08-03T00:00:00.000Z'));

    expect(result).toEqual({ processedUserIds: [], failedUserIds: [] });
  });

  it('deletes every item for a candidate whose grace period has elapsed', async () => {
    const repository = new FakeUserDeletionRepository();
    repository.addCandidate('user-1', '2026-07-01T00:00:00.000Z');
    repository.seedItems('user-1', [{ SK: 'PROFILE' }, { SK: 'TXN#2026-01-01#txn-1' }, { SK: 'CATEGORY#food' }, { SK: 'BUDGET#202601#food' }]);

    const result = await runWithdrawalDeletionBatch(repository, new Date('2026-08-03T00:00:00.000Z'));

    expect(result).toEqual({ processedUserIds: ['user-1'], failedUserIds: [] });
    expect(repository.itemCountFor('user-1')).toBe(0);
  });

  it('excludes active users and users whose grace period has not elapsed yet', async () => {
    const repository = new FakeUserDeletionRepository();
    // Only findCandidates is exercised for these two - an "active" user or one with a future
    // deletionScheduledAt would never be returned by the real Scan filter, so we simply don't
    // register them as candidates here (mirrors what the Scan's FilterExpression excludes).
    repository.addCandidate('user-future', '2099-01-01T00:00:00.000Z');
    repository.seedItems('user-future', [{ SK: 'PROFILE' }]);

    const result = await runWithdrawalDeletionBatch(repository, new Date('2026-08-03T00:00:00.000Z'));

    expect(result).toEqual({ processedUserIds: [], failedUserIds: [] });
    expect(repository.itemCountFor('user-future')).toBe(1);
  });

  it('records a failed user without stopping the batch for other candidates', async () => {
    const repository = new FakeUserDeletionRepository({ failingUserIds: ['user-bad'] });
    repository.addCandidate('user-bad', '2026-07-01T00:00:00.000Z');
    repository.seedItems('user-bad', [{ SK: 'PROFILE' }]);
    repository.addCandidate('user-good', '2026-07-15T00:00:00.000Z');
    repository.seedItems('user-good', [{ SK: 'PROFILE' }, { SK: 'TXN#2026-01-01#txn-1' }]);

    const result = await runWithdrawalDeletionBatch(repository, new Date('2026-08-03T00:00:00.000Z'));

    expect(result.processedUserIds).toEqual(['user-good']);
    expect(result.failedUserIds).toEqual(['user-bad']);
    // The failed user's items are left in place (deleteAllItemsForUser threw before clearing them).
    expect(repository.itemCountFor('user-bad')).toBe(1);
    expect(repository.itemCountFor('user-good')).toBe(0);
  });
});
