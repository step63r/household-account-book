import type { UserPlan } from './user';

/** 無料プランで参照・登録・更新可能な過去の月数 */
export const FREE_PLAN_HISTORY_MONTHS = 3;

/**
 * プランごとにアクセス可能な最古の日付（この日付以降のみ対象）を返す。
 * paid プランは無制限のため undefined を返す。
 * フロント（日付ピッカーのmin等）・バックエンド（クエリ・書き込みの制限）の両方で
 * このロジックを共有し、判定基準がズレないようにする。
 */
export function resolvePlanFloorDate(plan: UserPlan, reference: Date): Date | undefined {
  if (plan === 'paid') return undefined;

  const floor = new Date(reference);
  floor.setMonth(floor.getMonth() - FREE_PLAN_HISTORY_MONTHS);
  return floor;
}

/** resolvePlanFloorDate を YYYY-MM-DD 文字列で返す薄いラッパー（日付文字列比較用） */
export function resolvePlanFloorDateString(plan: UserPlan, reference: Date): string | undefined {
  return resolvePlanFloorDate(plan, reference)?.toISOString().slice(0, 10);
}
