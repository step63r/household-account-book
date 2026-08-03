import type { UserDeletionRepository } from './userDeletionRepository';

/**
 * In-memory UserDeletionRepository for unit tests. Never touches AWS - lets tests seed
 * arbitrary PROFILE/TXN/CATEGORY/BUDGET-shaped items per user (as a flat item store keyed
 * by userId) and assert the store empties out after a successful deletion.
 */
export class FakeUserDeletionRepository implements UserDeletionRepository {
  /** userId -> arbitrary "items" (PROFILE/TXN/CATEGORY/BUDGET stand-ins) owned by that user. */
  private readonly itemsByUserId = new Map<string, unknown[]>();
  private readonly candidates: { userId: string; deletionScheduledAt: string }[] = [];
  private readonly failingUserIds: Set<string>;

  constructor(options: { failingUserIds?: Iterable<string> } = {}) {
    this.failingUserIds = new Set(options.failingUserIds ?? []);
  }

  /** Seeds a withdrawal candidate (mirrors a PROFILE item with status: pendingDeletion). */
  addCandidate(userId: string, deletionScheduledAt: string): void {
    this.candidates.push({ userId, deletionScheduledAt });
  }

  /** Seeds arbitrary items (PROFILE/TXN/CATEGORY/BUDGET) owned by a user. */
  seedItems(userId: string, items: unknown[]): void {
    const existing = this.itemsByUserId.get(userId) ?? [];
    this.itemsByUserId.set(userId, [...existing, ...items]);
  }

  /** Marks a userId so deleteAllItemsForUser rejects for it, simulating a batch-write failure. */
  failFor(userId: string): void {
    this.failingUserIds.add(userId);
  }

  /** Test hook: number of items still stored for a user (0 once deletion has run). */
  itemCountFor(userId: string): number {
    return this.itemsByUserId.get(userId)?.length ?? 0;
  }

  async findCandidates(nowIso: string): Promise<{ userId: string; deletionScheduledAt: string }[]> {
    return this.candidates.filter((candidate) => candidate.deletionScheduledAt <= nowIso);
  }

  async deleteAllItemsForUser(userId: string): Promise<number> {
    if (this.failingUserIds.has(userId)) {
      throw new Error(`FakeUserDeletionRepository: simulated deletion failure for ${userId}`);
    }
    const items = this.itemsByUserId.get(userId) ?? [];
    this.itemsByUserId.delete(userId);
    return items.length;
  }
}
