import type { User } from '@household/shared';
import type { UserRepository } from '../repository/userRepository';

const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // CLAUDE.md: 30日程度の猶予期間

/**
 * 退会申請（論理削除）。CLAUDE.md方針: 退会操作時点で論理削除し、30日程度の猶予期間後に
 * バッチで物理削除する。物理削除バッチ自体は別タスク（EventBridge + Lambdaのスケジュール
 * 実行）として切り出し、ここでは status を pendingDeletion に遷移させるところまでを担う。
 *
 * 二重送信への耐性のため、既に pendingDeletion の場合は何もせず既存のプロフィールを
 * そのまま返す（deletionScheduledAt を毎回延長してしまわないように）。
 */
export async function requestWithdrawal(
  repository: UserRepository,
  userId: string,
  email: string,
): Promise<User> {
  const existing = await repository.getProfile(userId);
  if (existing?.status === 'pendingDeletion') {
    return existing;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const deletionScheduledAt = new Date(now.getTime() + DELETION_GRACE_PERIOD_MS).toISOString();

  const user: User = {
    id: userId,
    email,
    status: 'pendingDeletion',
    deletionRequestedAt: nowIso,
    deletionScheduledAt,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  await repository.put(user);
  return user;
}
