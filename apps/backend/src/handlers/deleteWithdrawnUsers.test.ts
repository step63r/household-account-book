import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * This is a scheduled (non-API Gateway) handler, so unlike the HTTP handlers there's no
 * request/response to model - just that it wires the real repository into the batch service
 * and surfaces failures by throwing (see plan: the resulting Lambda error trips the existing
 * per-function CloudWatch alarm). We mock the repository module so this stays a pure
 * unit/wiring test - no AWS calls.
 */
const { findCandidatesMock, deleteAllItemsForUserMock } = vi.hoisted(() => ({
  findCandidatesMock: vi.fn(),
  deleteAllItemsForUserMock: vi.fn(),
}));

vi.mock('../repository/userDeletionRepository', () => ({
  DynamoUserDeletionRepository: vi.fn().mockImplementation(() => ({
    findCandidates: findCandidatesMock,
    deleteAllItemsForUser: deleteAllItemsForUserMock,
  })),
}));

const { handler } = await import('./deleteWithdrawnUsers');

describe('deleteWithdrawnUsers handler', () => {
  beforeEach(() => {
    findCandidatesMock.mockReset();
    deleteAllItemsForUserMock.mockReset();
  });

  it('completes without throwing when there are no failures', async () => {
    findCandidatesMock.mockResolvedValue([
      { userId: 'user-1', deletionScheduledAt: '2026-07-01T00:00:00.000Z' },
    ]);
    deleteAllItemsForUserMock.mockResolvedValue(3);

    await expect(handler({} as never, {} as never, () => undefined)).resolves.toBeUndefined();
    expect(deleteAllItemsForUserMock).toHaveBeenCalledWith('user-1');
  });

  it('throws when at least one user fails to delete', async () => {
    findCandidatesMock.mockResolvedValue([
      { userId: 'user-1', deletionScheduledAt: '2026-07-01T00:00:00.000Z' },
    ]);
    deleteAllItemsForUserMock.mockRejectedValue(new Error('boom'));

    await expect(handler({} as never, {} as never, () => undefined)).rejects.toThrow(
      'Withdrawal deletion batch had 1 failure(s): user-1',
    );
  });
});
