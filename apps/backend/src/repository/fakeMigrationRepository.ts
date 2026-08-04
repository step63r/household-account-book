import type { User } from '@household/shared';
import type { MigrationRepository } from './migrationRepository';
import { PROFILE_SK, userPk } from './keys';

/**
 * In-memory MigrationRepository for unit tests. Never touches AWS. Items are stored keyed by
 * PK then SK, mirroring the raw (untyped) shape the real DynamoDB table holds - including old
 * pre-migration items that still carry a `userId` attribute (not `householdId`), so tests can
 * exercise the field-rename logic in `migrateUser()` itself rather than baking it into the fake.
 */
export class FakeMigrationRepository implements MigrationRepository {
  private readonly itemsByPk = new Map<string, Map<string, Record<string, unknown>>>();
  private readonly failCleanupForUserIds = new Set<string>();

  /** Test hook: seeds an arbitrary raw item (e.g. a legacy TXN#/CATEGORY#/BUDGET# item that
   * still has a `userId` attribute instead of `householdId`) directly under USER#<userId>. */
  seedUserItem(userId: string, sk: string, item: Record<string, unknown>): void {
    const pk = userPk(userId);
    const bucket = this.itemsByPk.get(pk) ?? new Map();
    bucket.set(sk, { ...item, PK: pk, SK: sk });
    this.itemsByPk.set(pk, bucket);
  }

  /** Test hook: seeds a USER#<userId>/PROFILE item. */
  seedUserProfile(user: User): void {
    this.seedUserItem(user.id, PROFILE_SK, { ...user });
  }

  /** Test hook: makes batchDeleteItems throw for a given user's items (simulates a
   * cleanup-phase failure after the commit phase already succeeded). */
  failCleanupFor(userId: string): void {
    this.failCleanupForUserIds.add(userId);
  }

  /** Test hook: raw item lookup, for assertions on what got written where. */
  getItem(pk: string, sk: string): Record<string, unknown> | undefined {
    return this.itemsByPk.get(pk)?.get(sk);
  }

  /** Test hook: every item still stored under a given PK. */
  listItems(pk: string): Record<string, unknown>[] {
    return [...(this.itemsByPk.get(pk)?.values() ?? [])];
  }

  async findUnmigratedUserIds(): Promise<string[]> {
    const userIds: string[] = [];
    for (const [pk, bucket] of this.itemsByPk) {
      if (!pk.startsWith('USER#')) continue;
      const profile = bucket.get(PROFILE_SK);
      if (profile && !profile.householdId) {
        userIds.push(pk.slice('USER#'.length));
      }
    }
    return userIds;
  }

  async queryUserPartition(userId: string): Promise<Record<string, unknown>[]> {
    return [...(this.itemsByPk.get(userPk(userId))?.values() ?? [])].map((item) => ({ ...item }));
  }

  async batchPutItems(items: Record<string, unknown>[]): Promise<void> {
    for (const item of items) {
      const pk = item.PK as string;
      const sk = item.SK as string;
      const bucket = this.itemsByPk.get(pk) ?? new Map();
      bucket.set(sk, { ...item });
      this.itemsByPk.set(pk, bucket);
    }
  }

  async putUserProfile(user: User): Promise<void> {
    this.seedUserItem(user.id, PROFILE_SK, { ...user });
  }

  async batchDeleteItems(keys: { PK: string; SK: string }[]): Promise<void> {
    const shouldFail = keys.some((key) => {
      if (!key.PK.startsWith('USER#')) return false;
      const userId = key.PK.slice('USER#'.length);
      return this.failCleanupForUserIds.has(userId);
    });
    if (shouldFail) {
      throw new Error('FakeMigrationRepository: simulated cleanup-phase failure');
    }
    for (const key of keys) {
      this.itemsByPk.get(key.PK)?.delete(key.SK);
    }
  }
}
