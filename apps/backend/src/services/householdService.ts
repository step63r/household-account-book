import { randomUUID } from 'node:crypto';
import {
  createInviteInputSchema,
  DEFAULT_HOUSEHOLD_NAME,
  INVITE_EXPIRY_DAYS,
  type Household,
  type HouseholdMemberSummary,
  type HouseholdSummary,
  type Invite,
  type InvitePreview,
  type User,
} from '@household/shared';
import type { EmailSender } from '../lib/email';
import { HttpError, NotFoundError } from '../lib/errors';
import type { HouseholdRepository } from '../repository/householdRepository';
import type { InviteRepository } from '../repository/inviteRepository';
import type { UserRepository } from '../repository/userRepository';

const INVITE_EXPIRY_MS = INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/**
 * 新規世帯を作成する（PROFILE + 発起人のMEMBERを書き込み）。新規ユーザーのオンボーディング
 * （userService.ensureProfileWithHousehold）と、世帯離脱時の受け皿世帯作成（leaveHousehold）
 * の両方から呼ばれる。
 */
export async function bootstrapHousehold(
  householdRepository: HouseholdRepository,
  userId: string,
  now: string,
): Promise<string> {
  const householdId = randomUUID();
  const household: Household = {
    id: householdId,
    name: DEFAULT_HOUSEHOLD_NAME,
    createdAt: now,
    updatedAt: now,
  };
  await householdRepository.putProfile(household);
  await householdRepository.putMember({ householdId, userId, joinedAt: now });
  return householdId;
}

/**
 * GET /households/me 用。世帯プロフィール＋メンバー一覧（各メンバーのemailを解決した形）を返す。
 * メンバーのUSER#プロフィールが（想定外に）見つからない場合はそのメンバーをスキップする
 * （空メールでレスポンスを汚さない）。
 */
export async function getMyHousehold(
  householdRepository: HouseholdRepository,
  userRepository: UserRepository,
  householdId: string,
): Promise<HouseholdSummary> {
  const [household, members] = await Promise.all([
    householdRepository.getProfile(householdId),
    householdRepository.listMembers(householdId),
  ]);
  if (!household) {
    throw new NotFoundError(`Household ${householdId} not found`);
  }

  const resolvedMembers = await Promise.all(
    members.map(async (member): Promise<HouseholdMemberSummary | undefined> => {
      const profile = await userRepository.getProfile(member.userId);
      if (!profile) {
        console.error(
          `getMyHousehold: member profile not found for userId ${member.userId} (household ${householdId})`,
        );
        return undefined;
      }
      return { userId: member.userId, email: profile.email, joinedAt: member.joinedAt };
    }),
  );

  return {
    id: household.id,
    name: household.name,
    members: resolvedMembers.filter(
      (member): member is HouseholdMemberSummary => member !== undefined,
    ),
  };
}

export interface CreateInviteParams {
  householdId: string;
  householdName: string;
  invitedByUserId: string;
  invitedByEmail: string;
  frontendBaseUrl: string;
  rawInput: unknown;
}

/** POST /households/me/invites 用。招待トークンを発行し、招待メールを送信する。 */
export async function createInvite(
  inviteRepository: InviteRepository,
  emailSender: EmailSender,
  params: CreateInviteParams,
): Promise<{ invitedEmail: string; expiresAt: string }> {
  const { email } = createInviteInputSchema.parse(params.rawInput);
  const invitedEmail = email.trim().toLowerCase();
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_MS).toISOString();

  const invite: Invite = {
    token,
    householdId: params.householdId,
    invitedEmail,
    invitedByUserId: params.invitedByUserId,
    createdAt: now.toISOString(),
    expiresAt,
  };
  await inviteRepository.put(invite);

  await emailSender.sendInviteEmail({
    to: invitedEmail,
    householdName: params.householdName,
    invitedByEmail: params.invitedByEmail,
    inviteUrl: `${params.frontendBaseUrl}/join-household?token=${token}`,
  });

  return { invitedEmail, expiresAt };
}

/**
 * GET /invites/{token}（未認証）用。存在しないトークンと失効済みトークンは同じ404を返し、
 * トークン保持者に「存在するかどうか」自体を漏らさない。
 * DynamoDB TTLの自動削除は最大48時間程度遅延しうるため、アイテムがまだ存在していても
 * `expiresAt <= now` を明示チェックする（TTL任せにしない）。
 */
export async function previewInvite(
  inviteRepository: InviteRepository,
  householdRepository: HouseholdRepository,
  userRepository: UserRepository,
  token: string | undefined,
): Promise<InvitePreview> {
  const invite = token ? await inviteRepository.get(token) : undefined;
  const now = new Date().toISOString();
  if (!invite || invite.expiresAt <= now) {
    throw new NotFoundError('Invite not found or expired');
  }

  const [household, inviter] = await Promise.all([
    householdRepository.getProfile(invite.householdId),
    userRepository.getProfile(invite.invitedByUserId),
  ]);
  if (!household) {
    console.error(`previewInvite: household ${invite.householdId} not found for token ${token}`);
  }
  if (!inviter) {
    console.error(`previewInvite: inviter ${invite.invitedByUserId} not found for token ${token}`);
  }

  return {
    householdName: household?.name ?? DEFAULT_HOUSEHOLD_NAME,
    invitedEmail: invite.invitedEmail,
    invitedByEmail: inviter?.email ?? '',
    expiresAt: invite.expiresAt,
  };
}

export interface AcceptInviteParams {
  token: string;
  callerUserId: string;
  callerEmail: string;
  currentHouseholdId: string;
  callerProfile: User;
}

/**
 * POST /invites/{token}/accept 用。検証順序が安全性の要（詳細はplanファイル参照）:
 * ①未失効チェック ②email一致チェック ③既に対象世帯に所属済みなら冪等成功
 * ④現在の世帯がfresh（実データ無し）でなければ拒否 ⑤新しい世帯参照を先にコミット
 * ⑥旧世帯のクリーンアップ・⑦招待削除はbest-effort（失敗してもthrowしない）。
 * この順序は、途中でLambdaがクラッシュしてもユーザーのhouseholdId参照が壊れないための安全策。
 */
export async function acceptInvite(
  householdRepository: HouseholdRepository,
  userRepository: UserRepository,
  inviteRepository: InviteRepository,
  params: AcceptInviteParams,
): Promise<HouseholdSummary> {
  const { token, callerUserId, callerEmail, currentHouseholdId, callerProfile } = params;

  const invite = await inviteRepository.get(token);
  const now = new Date().toISOString();
  if (!invite || invite.expiresAt <= now) {
    throw new HttpError(410, 'この招待リンクは期限切れ、または無効です', 'INVITE_EXPIRED');
  }

  if (invite.invitedEmail.toLowerCase() !== callerEmail.toLowerCase()) {
    throw new HttpError(
      403,
      'この招待は別のメールアドレス宛に発行されています',
      'INVITE_EMAIL_MISMATCH',
    );
  }

  if (currentHouseholdId === invite.householdId) {
    // Idempotent success: the caller already belongs to the target household (e.g. retried
    // request, or clicking the invite link twice).
    return getMyHousehold(householdRepository, userRepository, invite.householdId);
  }

  const currentHouseholdIsFresh = await householdRepository.isFresh(currentHouseholdId);
  if (!currentHouseholdIsFresh) {
    throw new HttpError(
      409,
      '既存の取引・予算データがあるため、この世帯には参加できません',
      'HOUSEHOLD_NOT_FRESH',
    );
  }

  // Commit the new state first (join target household + repoint USER PROFILE), so a crash
  // partway through never leaves the caller's householdId reference dangling.
  await householdRepository.putMember({
    householdId: invite.householdId,
    userId: callerUserId,
    joinedAt: now,
  });
  await userRepository.put({ ...callerProfile, householdId: invite.householdId, updatedAt: now });

  // Best-effort cleanup of the old (guaranteed-empty per the isFresh check above) household.
  try {
    await householdRepository.deleteMember(currentHouseholdId, callerUserId);
    await householdRepository.deleteAllItems(currentHouseholdId);
  } catch (error) {
    console.error(
      `acceptInvite: best-effort cleanup of old household ${currentHouseholdId} failed for user ${callerUserId}`,
      error,
    );
  }

  try {
    await inviteRepository.delete(token);
  } catch (error) {
    console.error(`acceptInvite: best-effort invite cleanup failed for token ${token}`, error);
  }

  return getMyHousehold(householdRepository, userRepository, invite.householdId);
}

export interface LeaveHouseholdParams {
  callerUserId: string;
  currentHouseholdId: string;
  callerProfile: User;
}

/**
 * POST /households/me/leave 用。「全部共有」の前提と整合させ、データは一切持ち出さず
 * 新しい空の世帯を作ってそちらへ移る。自分だけの世帯の場合は退会フローへ誘導する。
 */
export async function leaveHousehold(
  householdRepository: HouseholdRepository,
  userRepository: UserRepository,
  params: LeaveHouseholdParams,
): Promise<HouseholdSummary> {
  const { callerUserId, currentHouseholdId, callerProfile } = params;

  const members = await householdRepository.listMembers(currentHouseholdId);
  if (members.length <= 1) {
    throw new HttpError(
      400,
      '世帯のメンバーが自分のみのため脱退できません。退会をご検討ください。',
      'SOLE_MEMBER',
    );
  }

  const now = new Date().toISOString();
  const newHouseholdId = await bootstrapHousehold(householdRepository, callerUserId, now);
  // Commit the new household reference first, same rationale as acceptInvite.
  await userRepository.put({ ...callerProfile, householdId: newHouseholdId, updatedAt: now });

  try {
    await householdRepository.deleteMember(currentHouseholdId, callerUserId);
  } catch (error) {
    console.error(
      `leaveHousehold: best-effort cleanup of old membership failed for user ${callerUserId} in household ${currentHouseholdId}`,
      error,
    );
  }

  return getMyHousehold(householdRepository, userRepository, newHouseholdId);
}
