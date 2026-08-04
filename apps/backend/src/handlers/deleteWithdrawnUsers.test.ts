import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * This is a scheduled (non-API Gateway) handler, so unlike the HTTP handlers there's no
 * request/response to model - just that it wires the real repositories into the batch service
 * and surfaces failures by throwing (see plan: the resulting Lambda error trips the existing
 * per-function CloudWatch alarm). We mock the repository modules so this stays a pure
 * unit/wiring test - no AWS calls.
 */
const {
  findCandidatesMock,
  getUserHouseholdIdMock,
  deleteUserProfileMock,
  deleteAllLegacyItemsMock,
  deleteMemberMock,
  listMembersMock,
  deleteAllItemsMock,
} = vi.hoisted(() => ({
  findCandidatesMock: vi.fn(),
  getUserHouseholdIdMock: vi.fn(),
  deleteUserProfileMock: vi.fn(),
  deleteAllLegacyItemsMock: vi.fn(),
  deleteMemberMock: vi.fn(),
  listMembersMock: vi.fn(),
  deleteAllItemsMock: vi.fn(),
}));

vi.mock('../repository/userDeletionRepository', () => ({
  DynamoUserDeletionRepository: vi.fn().mockImplementation(() => ({
    findCandidates: findCandidatesMock,
    getUserHouseholdId: getUserHouseholdIdMock,
    deleteUserProfile: deleteUserProfileMock,
    deleteAllLegacyItems: deleteAllLegacyItemsMock,
  })),
}));

vi.mock('../repository/householdRepository', () => ({
  DynamoHouseholdRepository: vi.fn().mockImplementation(() => ({
    deleteMember: deleteMemberMock,
    listMembers: listMembersMock,
    deleteAllItems: deleteAllItemsMock,
  })),
}));

const { handler } = await import('./deleteWithdrawnUsers');

describe('deleteWithdrawnUsers handler', () => {
  beforeEach(() => {
    findCandidatesMock.mockReset();
    getUserHouseholdIdMock.mockReset();
    deleteUserProfileMock.mockReset();
    deleteAllLegacyItemsMock.mockReset();
    deleteMemberMock.mockReset();
    listMembersMock.mockReset();
    deleteAllItemsMock.mockReset();

    getUserHouseholdIdMock.mockResolvedValue(undefined);
    deleteUserProfileMock.mockResolvedValue(undefined);
    deleteAllLegacyItemsMock.mockResolvedValue(0);
    deleteMemberMock.mockResolvedValue(undefined);
    listMembersMock.mockResolvedValue([]);
    deleteAllItemsMock.mockResolvedValue(0);
  });

  it('completes without throwing when there are no failures', async () => {
    findCandidatesMock.mockResolvedValue([
      { userId: 'user-1', deletionScheduledAt: '2026-07-01T00:00:00.000Z' },
    ]);
    deleteAllLegacyItemsMock.mockResolvedValue(3);

    await expect(handler({} as never, {} as never, () => undefined)).resolves.toBeUndefined();
    expect(deleteUserProfileMock).toHaveBeenCalledWith('user-1');
  });

  it('throws when at least one user fails to delete', async () => {
    findCandidatesMock.mockResolvedValue([
      { userId: 'user-1', deletionScheduledAt: '2026-07-01T00:00:00.000Z' },
    ]);
    deleteUserProfileMock.mockRejectedValue(new Error('boom'));

    await expect(handler({} as never, {} as never, () => undefined)).rejects.toThrow(
      'Withdrawal deletion batch had 1 failure(s): user-1',
    );
  });
});
