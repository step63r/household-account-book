import {
  CURRENT_TERMS_VERSION,
  type ConsentStatus,
  type User,
  type UserPlan,
  type UserProfileResponse,
} from '@household/shared';
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
    return withPlanDefault(existing);
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
    plan: existing?.plan ?? 'free',
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
  await repository.put(user);
  return user;
}

function toConsentStatus(user: User): ConsentStatus {
  return {
    currentVersion: CURRENT_TERMS_VERSION,
    termsAgreedVersion: user.termsAgreedVersion,
    termsAgreedAt: user.termsAgreedAt,
    mustAgree: user.termsAgreedVersion !== CURRENT_TERMS_VERSION,
  };
}

function defaultProfile(userId: string, email: string, now: string): User {
  return { id: userId, email, status: 'active', plan: 'free', createdAt: now, updatedAt: now };
}

/**
 * plan フィールド追加前に作成された既存 PROFILE アイテムを free 扱いで補完する。
 * DynamoDB はスキーマレスなので、明示的なバックフィルバッチは行わず読み込み側で吸収する。
 */
function withPlanDefault(user: User): User {
  return user.plan ? user : { ...user, plan: 'free' };
}

/** 現在のプランを返す（PROFILE未作成ユーザーは free 扱い）。決済連携前の読み取り専用ヘルパー。 */
export async function getUserPlan(repository: UserRepository, userId: string): Promise<UserPlan> {
  const existing = await repository.getProfile(userId);
  return existing ? withPlanDefault(existing).plan : 'free';
}

/**
 * GET /users/me 用のプロフィール（プラン判定に必要な最小限のフィールドのみ）を返す。
 * getConsentStatus と同じく、プロフィール未作成の場合はここで PROFILE アイテムを遅延作成する。
 */
export async function getMyProfile(
  repository: UserRepository,
  userId: string,
  email: string,
): Promise<UserProfileResponse> {
  const existing = await repository.getProfile(userId);
  if (existing) return { plan: withPlanDefault(existing).plan };

  const now = new Date().toISOString();
  const user = defaultProfile(userId, email, now);
  await repository.put(user);
  return { plan: user.plan };
}

/**
 * 同意状況を返す。プロフィール未作成（新規ユーザーの初回チェック）の場合は
 * categoryService.listCategories のプリセット遅延投入と同様、ここで PROFILE
 * アイテムを遅延作成する。termsAgreedVersion が未設定のため mustAgree は
 * 自動的に true になる（既存ユーザーの「未同意」も同じ表現で扱える）。
 */
export async function getConsentStatus(
  repository: UserRepository,
  userId: string,
  email: string,
): Promise<ConsentStatus> {
  const existing = await repository.getProfile(userId);
  if (existing) return toConsentStatus(withPlanDefault(existing));

  const now = new Date().toISOString();
  const user = defaultProfile(userId, email, now);
  await repository.put(user);
  return toConsentStatus(user);
}

/** 同意を記録する。バージョンはクライアントから受け取らず、常に CURRENT_TERMS_VERSION を使う。 */
export async function recordConsent(
  repository: UserRepository,
  userId: string,
  email: string,
): Promise<ConsentStatus> {
  const now = new Date().toISOString();
  const existing = await repository.getProfile(userId);
  const user: User = {
    ...(existing ? withPlanDefault(existing) : defaultProfile(userId, email, now)),
    termsAgreedVersion: CURRENT_TERMS_VERSION,
    termsAgreedAt: now,
    updatedAt: now,
  };
  await repository.put(user);
  return toConsentStatus(user);
}
