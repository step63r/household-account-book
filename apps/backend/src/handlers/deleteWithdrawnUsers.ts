import type { ScheduledHandler } from 'aws-lambda';
import { logAudit } from '../lib/audit';
import { DynamoUserDeletionRepository } from '../repository/userDeletionRepository';
import { runWithdrawalDeletionBatch } from '../services/withdrawalBatchService';

/**
 * EventBridge-scheduled batch (see CLAUDE.md "退会時のデータ削除"): hard-deletes every
 * DynamoDB item for users whose withdrawal grace period has elapsed. Unlike the API Gateway
 * handlers, this isn't invoked over HTTP, so it doesn't use `handleError`/`jsonResponse` -
 * there's no HTTP response to shape, only success/failure of the scheduled invocation.
 */
export const handler: ScheduledHandler = async () => {
  const repository = new DynamoUserDeletionRepository();
  const result = await runWithdrawalDeletionBatch(repository);

  logAudit({
    userId: 'system',
    action: 'user.physicalDelete.batchSummary',
    targetId: 'batch',
    details: {
      processed: result.processedUserIds.length,
      failed: result.failedUserIds.length,
      failedUserIds: result.failedUserIds,
    },
  });

  if (result.failedUserIds.length > 0) {
    throw new Error(
      `Withdrawal deletion batch had ${result.failedUserIds.length} failure(s): ${result.failedUserIds.join(', ')}`,
    );
  }
};
