import { logAudit } from '../lib/audit';
import type { HouseholdRepository } from '../repository/householdRepository';
import type { UserDeletionRepository } from '../repository/userDeletionRepository';

export interface WithdrawalDeletionBatchResult {
  processedUserIds: string[];
  failedUserIds: string[];
}

/**
 * Physical-deletion half of the withdrawal flow (see CLAUDE.md "退会時のデータ削除").
 * `userService.requestWithdrawal` already handles the soft-delete (status: pendingDeletion +
 * deletionScheduledAt); this runs on a schedule (see `handlers/deleteWithdrawnUsers.ts`) to
 * hard-delete every DynamoDB item for users whose grace period has elapsed.
 *
 * Candidates are processed sequentially (not in parallel) and one user's failure never stops
 * the rest of the batch from being processed - the failure is recorded and the batch moves on.
 *
 * Per candidate: delete the USER#<userId>/PROFILE item, then either (a) if the user was
 * migrated to a household, remove their MEMBER# item and cascade-delete the whole household
 * once no members remain, or (b) if the user never got migrated (legacy data still living
 * directly under USER#<userId>), fall back to deleting everything under that partition key.
 */
export async function runWithdrawalDeletionBatch(
  userDeletionRepository: UserDeletionRepository,
  householdRepository: HouseholdRepository,
  now: Date = new Date(),
): Promise<WithdrawalDeletionBatchResult> {
  const candidates = await userDeletionRepository.findCandidates(now.toISOString());

  const processedUserIds: string[] = [];
  const failedUserIds: string[] = [];

  for (const candidate of candidates) {
    try {
      const householdId = await userDeletionRepository.getUserHouseholdId(candidate.userId);
      await userDeletionRepository.deleteUserProfile(candidate.userId);
      let deletedItemCount = 1;

      if (householdId) {
        await householdRepository.deleteMember(householdId, candidate.userId);
        deletedItemCount += 1;
        const remaining = await householdRepository.listMembers(householdId);
        if (remaining.length === 0) {
          deletedItemCount += await householdRepository.deleteAllItems(householdId);
        }
      } else {
        deletedItemCount += await userDeletionRepository.deleteAllLegacyItems(candidate.userId);
      }

      logAudit({
        userId: candidate.userId,
        action: 'user.physicalDelete',
        targetId: candidate.userId,
        details: { deletedItemCount, deletionScheduledAt: candidate.deletionScheduledAt },
      });
      processedUserIds.push(candidate.userId);
    } catch (error) {
      console.error(
        `Withdrawal deletion batch failed to delete data for user ${candidate.userId}`,
        error,
      );
      failedUserIds.push(candidate.userId);
    }
  }

  return { processedUserIds, failedUserIds };
}
