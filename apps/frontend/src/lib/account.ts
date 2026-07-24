/**
 * アカウント（ユーザー本体）API クライアント。
 *
 * ログイン/サインアップは `src/lib/auth.ts` から Cognito に直接連携するが、退会は
 * DynamoDB側の状態変更（論理削除）が必要なため `apps/backend` の
 * `POST /users/me/withdraw` を呼ぶ。`auth.ts` に置くと `api.ts`（`getAuthToken` で
 * `auth.ts` の `getCurrentSession` を参照する）と循環importになるため、別モジュールに
 * 分けている。
 */
import { apiFetch } from '@/lib/api';

/** 退会申請。CLAUDE.md 方針: 論理削除→30日程度の猶予後にバッチで物理削除。 */
export async function requestAccountWithdrawal(): Promise<void> {
  await apiFetch<unknown>('/users/me/withdraw', { method: 'POST' });
}
