import type { UserDeletionRepository } from './userDeletionRepository';

/**
 * In-memory UserDeletionRepository for unit tests. Never touches AWS - lets tests seed a
 * withdrawal candidate as either "migrated" (has a householdId) or "legacy" (un-migrated,
 * still owns PROFILE/TXN/CATEGORY/BUDGET items directly under USER#<userId>) and assert the
 * expected deletion path was exercised.
 */
export class FakeUserDeletionRepository implements UserDeletionRepository {
  private readonly householdIdByUserId = new Map<string, string>();
  private readonly profileExists = new Set<string>();
  /** userId -> arbitrary "items" (TXN/CATEGORY/BUDGET stand-ins) owned directly by a legacy user. */
  private readonly legacyItemsByUserId = new Map<string, unknown[]>();
  private readonly candidates: { userId: string; deletionScheduledAt: string }[] = [];
  private readonly failingUserIds: Set<string>;

  constructor(options: { failingUserIds?: Iterable<string> } = {}) {
    this.failingUserIds = new Set(options.failingUserIds ?? []);
  }

  /** Seeds a withdrawal candidate (mirrors a PROFILE item with status: pendingDeletion). */
  addCandidate(userId: string, deletionScheduledAt: string): void {
    this.candidates.push({ userId, deletionScheduledAt });
    this.profileExists.add(userId);
  }

  /** Marks a candidate as already migrated to a household. */
  setHouseholdId(userId: string, householdId: string): void {
    this.householdIdByUserId.set(userId, householdId);
  }

  /** Seeds legacy (un-migrated) items owned directly under USER#<userId>. */
  seedLegacyItems(userId: string, items: unknown[]): void {
    const existing = this.legacyItemsByUserId.get(userId) ?? [];
    this.legacyItemsByUserId.set(userId, [...existing, ...items]);
  }

  /** Marks a userId so deleteUserProfile rejects for it, simulating a deletion failure. */
  failFor(userId: string): void {
    this.failingUserIds.add(userId);
  }

  /** Test hook: whether the USER#<userId>/PROFILE item still exists. */
  profileExistsFor(userId: string): boolean {
    return this.profileExists.has(userId);
  }

  /** Test hook: number of legacy items still stored for a user (0 once deletion has run). */
  legacyItemCountFor(userId: string): number {
    return this.legacyItemsByUserId.get(userId)?.length ?? 0;
  }

  async findCandidates(nowIso: string): Promise<{ userId: string; deletionScheduledAt: string }[]> {
    return this.candidates.filter((candidate) => candidate.deletionScheduledAt <= nowIso);
  }

  async getUserHouseholdId(userId: string): Promise<string | undefined> {
    return this.householdIdByUserId.get(userId);
  }

  async deleteUserProfile(userId: string): Promise<void> {
    if (this.failingUserIds.has(userId)) {
      throw new Error(`FakeUserDeletionRepository: simulated deletion failure for ${userId}`);
    }
    this.profileExists.delete(userId);
  }

  async deleteAllLegacyItems(userId: string): Promise<number> {
    const items = this.legacyItemsByUserId.get(userId) ?? [];
    this.legacyItemsByUserId.delete(userId);
    return items.length;
  }
}
