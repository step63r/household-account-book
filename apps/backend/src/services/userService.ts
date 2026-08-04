import {
  CURRENT_TERMS_VERSION,
  type ConsentStatus,
  type User,
  type UserPlan,
  type UserProfileResponse,
} from '@household/shared';
import { HttpError } from '../lib/errors';
import type { HouseholdRepository } from '../repository/householdRepository';
import type { UserRepository } from '../repository/userRepository';
import { bootstrapHousehold } from './householdService';

const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // CLAUDE.md: 30日程度の猶予期間

/**
 * 退会申請（論理削除）。CLAUDE.md方針: 退会操作時点で論理削除し、30日程度の猶予期間後に
 * バッチで物理削除する。物理削除バッチ自体は別タスク（EventBridge + Lambdaのスケジュール
 * 実行）として切り出し、ここでは status を pendingDeletion に遷移させるところまでを担う。
 *
 * 二重送信への耐性のため、既に pendingDeletion の場合は何もせず既存のプロフィールを
 * そのまま返す（deletionScheduledAt を毎回延長してしまわないように）。
 *
 * 世帯共有機能の導入後もリクエスト時点では世帯を意識しない（householdRepository不要）。
 * 世帯からの離脱・世帯削除の判断は物理削除バッチ（withdrawalBatchService.ts）側で行う。
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
    householdId: existing?.householdId,
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

/**
 * PROFILE遅延作成ロジックの一本化。getMyProfile/getConsentStatus/recordConsentがそれぞれ
 * 独自に持っていた重複を解消する。
 * - 既存プロフィールに householdId があればそのまま返す
 * - 既存プロフィールはあるが householdId が無い（家族共有機能導入前の未移行データ）場合は
 *   フェイルラウドに 503 を返す。ここで黙って空の世帯を作ってしまうと、既存の取引・費目・
 *   予算データが新しい空世帯の下に見えてしまい、実質的に迷子になる（本来は
 *   scripts/migrateUsersToHouseholds.ts による明示的な移行が必要）。
 * - プロフィール自体が無ければ、新規世帯を bootstrapHousehold で作成してから作る
 */
export async function ensureProfileWithHousehold(
  userRepository: UserRepository,
  householdRepository: HouseholdRepository,
  userId: string,
  email: string,
): Promise<User> {
  const existing = await userRepository.getProfile(userId);
  if (existing?.householdId) {
    return withPlanDefault(existing);
  }
  if (existing && !existing.householdId) {
    throw new HttpError(
      503,
      'アカウントデータの移行が完了していません。しばらくしてから再度お試しください。',
      'HOUSEHOLD_MIGRATION_PENDING',
    );
  }

  const now = new Date().toISOString();
  const householdId = await bootstrapHousehold(householdRepository, userId, now);
  const user: User = { ...defaultProfile(userId, email, now), householdId };
  await userRepository.put(user);
  return user;
}

export interface UserContext {
  plan: UserPlan;
  householdId: string;
}

/** transaction/category/budget/aggregation系ハンドラが必要とする最小限のコンテキストをまとめて返す。 */
export async function getUserContext(
  userRepository: UserRepository,
  householdRepository: HouseholdRepository,
  userId: string,
  email: string,
): Promise<UserContext> {
  const user = await ensureProfileWithHousehold(userRepository, householdRepository, userId, email);
  // householdId is always set at this point: ensureProfileWithHousehold either returns an
  // existing profile that already has one, or a freshly bootstrapped profile that was just
  // given one above.
  return { plan: user.plan, householdId: user.householdId! };
}

/**
 * GET /users/me 用のプロフィール（プラン判定に必要な最小限のフィールドのみ）を返す。
 * ensureProfileWithHousehold に委譲し、プロフィール未作成の場合はここで世帯ごと遅延作成する。
 */
export async function getMyProfile(
  userRepository: UserRepository,
  householdRepository: HouseholdRepository,
  userId: string,
  email: string,
): Promise<UserProfileResponse> {
  const user = await ensureProfileWithHousehold(userRepository, householdRepository, userId, email);
  return { plan: user.plan };
}

/**
 * 同意状況を返す。プロフィール未作成（新規ユーザーの初回チェック）の場合は
 * ensureProfileWithHousehold が世帯ごと遅延作成する。termsAgreedVersion が未設定のため
 * mustAgree は自動的に true になる（既存ユーザーの「未同意」も同じ表現で扱える）。
 */
export async function getConsentStatus(
  userRepository: UserRepository,
  householdRepository: HouseholdRepository,
  userId: string,
  email: string,
): Promise<ConsentStatus> {
  const user = await ensureProfileWithHousehold(userRepository, householdRepository, userId, email);
  return toConsentStatus(user);
}

/** 同意を記録する。バージョンはクライアントから受け取らず、常に CURRENT_TERMS_VERSION を使う。 */
export async function recordConsent(
  userRepository: UserRepository,
  householdRepository: HouseholdRepository,
  userId: string,
  email: string,
): Promise<ConsentStatus> {
  const existing = await ensureProfileWithHousehold(
    userRepository,
    householdRepository,
    userId,
    email,
  );
  const now = new Date().toISOString();
  const user: User = {
    ...existing,
    termsAgreedVersion: CURRENT_TERMS_VERSION,
    termsAgreedAt: now,
    updatedAt: now,
  };
  await userRepository.put(user);
  return toConsentStatus(user);
}
