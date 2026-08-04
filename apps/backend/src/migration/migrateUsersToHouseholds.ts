import { randomUUID } from 'node:crypto';
import { DEFAULT_HOUSEHOLD_NAME, type User } from '@household/shared';
import type { MigrationRepository } from '../repository/migrationRepository';
import { PROFILE_SK, TRANSACTION_SK_PREFIX, householdPk, memberSk } from '../repository/keys';

export type MigrationStatus = 'migrated' | 'alreadyMigrated' | 'dryRun' | 'missingProfile';

export interface MigrationResult {
  userId: string;
  status: MigrationStatus;
  /** Set whenever a household id was resolved for this user - the newly-bootstrapped id for
   * 'migrated'/'dryRun', or the pre-existing one for 'alreadyMigrated'. Undefined only for
   * 'missingProfile' (nothing to migrate). */
  newHouseholdId?: string;
  /** Number of TXN#/CATEGORY#/BUDGET# items copied to the new household partition. */
  copiedItemCount: number;
  /** Number of old USER#<userId> child items successfully deleted in the cleanup phase. */
  deletedOldItemCount: number;
  /** True iff the (best-effort) cleanup phase failed - the migration itself still succeeded
   * (commit phase already happened), this just means old items are left as harmless orphans. */
  cleanupFailed: boolean;
}

export interface MigrateUserOptions {
  dryRun: boolean;
}

/**
 * Migrates a single legacy USER#<userId>-scoped account to a new HOUSEHOLD#<id> partition (see
 * the plan file's "既存本番データの移行" section for the full design rationale).
 *
 * Safe to re-run: an already-migrated profile (householdId already set) is a no-op skip, and a
 * run that crashes between the copy phase and the commit phase leaves behind only harmless
 * orphaned HOUSEHOLD#<abandoned> items - nothing ever points to them since the commit (the only
 * point-of-no-return) never happened, so the next run just starts over from scratch for that user.
 */
export async function migrateUser(
  repository: MigrationRepository,
  userId: string,
  options: MigrateUserOptions,
  now: string = new Date().toISOString(),
): Promise<MigrationResult> {
  const items = await repository.queryUserPartition(userId);
  const profileItem = items.find((item) => item.SK === PROFILE_SK);

  if (!profileItem) {
    console.error(`[migrate] ${userId}: no USER#${userId}/PROFILE item found - skipping`);
    return {
      userId,
      status: 'missingProfile',
      copiedItemCount: 0,
      deletedOldItemCount: 0,
      cleanupFailed: false,
    };
  }

  const {
    PK: _profilePk,
    SK: _profileSk,
    ...profile
  } = profileItem as unknown as User & {
    PK: string;
    SK: string;
  };

  if (profile.householdId) {
    console.log(
      `[migrate] ${userId}: already migrated (householdId=${profile.householdId}) - skipping`,
    );
    return {
      userId,
      status: 'alreadyMigrated',
      newHouseholdId: profile.householdId,
      copiedItemCount: 0,
      deletedOldItemCount: 0,
      cleanupFailed: false,
    };
  }

  const childItems = items.filter((item) => item.SK !== PROFILE_SK);
  const newHouseholdId = randomUUID();

  if (options.dryRun) {
    const txnCount = childItems.filter((item) =>
      (item.SK as string).startsWith(TRANSACTION_SK_PREFIX),
    ).length;
    console.log(
      `[migrate] [dry-run] ${userId}: would migrate to household ${newHouseholdId} ` +
        `(${childItems.length} item(s) total, ${txnCount} transaction(s) would get createdBy=${userId})`,
    );
    return {
      userId,
      status: 'dryRun',
      newHouseholdId,
      copiedItemCount: childItems.length,
      deletedOldItemCount: 0,
      cleanupFailed: false,
    };
  }

  // --- Copy phase (pure additions, safe to redo if the run crashes before the commit phase) ---
  const householdProfileItem = {
    PK: householdPk(newHouseholdId),
    SK: PROFILE_SK,
    id: newHouseholdId,
    name: DEFAULT_HOUSEHOLD_NAME,
    createdAt: now,
    updatedAt: now,
  };
  const memberItem = {
    PK: householdPk(newHouseholdId),
    SK: memberSk(userId),
    householdId: newHouseholdId,
    userId,
    // Backdated to the user's original account creation, not migration time.
    joinedAt: profile.createdAt,
  };
  const copiedChildItems = childItems.map((item) => {
    const { PK: _oldPk, SK: oldSk, userId: _oldUserId, ...rest } = item;
    const isTransaction = (oldSk as string).startsWith(TRANSACTION_SK_PREFIX);
    return {
      ...rest,
      PK: householdPk(newHouseholdId),
      SK: oldSk,
      householdId: newHouseholdId,
      // Backfills the new required Transaction.createdBy field for free, attributing every
      // pre-existing transaction to the account that originally owned it.
      ...(isTransaction ? { createdBy: userId } : {}),
    };
  });

  await repository.batchPutItems([householdProfileItem, memberItem, ...copiedChildItems]);
  console.log(
    `[migrate] ${userId}: copy phase done - household ${newHouseholdId}, ${copiedChildItems.length} item(s) copied`,
  );

  // --- Commit phase (the one point-of-no-return) ---
  const committedProfile: User = {
    ...(profile as User),
    householdId: newHouseholdId,
    updatedAt: now,
  };
  await repository.putUserProfile(committedProfile);
  console.log(
    `[migrate] ${userId}: commit phase done - USER#${userId}/PROFILE now has householdId=${newHouseholdId}`,
  );

  // --- Cleanup phase (best-effort, log-and-continue - never fatal to the script) ---
  let cleanupFailed = false;
  let deletedOldItemCount = 0;
  try {
    await repository.batchDeleteItems(
      childItems.map((item) => ({ PK: item.PK as string, SK: item.SK as string })),
    );
    deletedOldItemCount = childItems.length;
    console.log(
      `[migrate] ${userId}: cleanup phase done - ${deletedOldItemCount} old item(s) deleted under USER#${userId}`,
    );
  } catch (error) {
    cleanupFailed = true;
    console.error(
      `[migrate] ${userId}: cleanup phase FAILED - old USER#${userId} child items are left behind ` +
        `as harmless orphans (nothing reads USER#${userId} for data once householdId is set). ` +
        `Manual cleanup is optional, not required.`,
      error,
    );
  }

  return {
    userId,
    status: 'migrated',
    newHouseholdId,
    copiedItemCount: copiedChildItems.length,
    deletedOldItemCount,
    cleanupFailed,
  };
}

export interface RunMigrationOptions {
  dryRun: boolean;
  /** Restricts the run to exactly one user (e.g. a canary run before migrating everyone).
   * Bypasses the Scan entirely - migrateUser() itself still performs the idempotency check,
   * so passing an already-migrated user's id here is always a safe no-op. */
  userId?: string;
}

/**
 * Orchestrates the full migration run: resolves candidates (via Scan, or a single --user-id),
 * then migrates each sequentially - one user at a time keeps the console log directly
 * attributable, and a failure partway through the candidate list doesn't need any special
 * handling here since migrateUser() never throws (see its cleanup-phase try/catch).
 */
export async function runMigration(
  repository: MigrationRepository,
  options: RunMigrationOptions,
): Promise<MigrationResult[]> {
  const userIds = options.userId ? [options.userId] : await repository.findUnmigratedUserIds();
  const now = new Date().toISOString();

  const results: MigrationResult[] = [];
  for (const userId of userIds) {
    const result = await migrateUser(repository, userId, { dryRun: options.dryRun }, now);
    results.push(result);
  }
  return results;
}
