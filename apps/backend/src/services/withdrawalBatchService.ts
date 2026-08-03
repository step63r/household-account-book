import { logAudit } from '../lib/audit';
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
 */
export async function runWithdrawalDeletionBatch(
  repository: UserDeletionRepository,
  now: Date = new Date(),
): Promise<WithdrawalDeletionBatchResult> {
  const candidates = await repository.findCandidates(now.toISOString());

  const processedUserIds: string[] = [];
  const failedUserIds: string[] = [];

  for (const candidate of candidates) {
    try {
      const deletedItemCount = await repository.deleteAllItemsForUser(candidate.userId);
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
