import {
  FREE_PLAN_HISTORY_MONTHS,
  resolvePlanFloorDateString,
  type UserPlan,
} from '@household/shared';
import { HttpError } from './errors';

/**
 * Throws a 403 (code: PLAN_RESTRICTED) if `targetDate` (YYYY-MM-DD, matching
 * transactionSchema's `date` format) falls outside the plan's accessible history window.
 * No-op for `paid` (unlimited) - only `free` plans have a floor date.
 */
export function assertWithinPlanWindow(
  plan: UserPlan,
  targetDate: string,
  now: Date = new Date(),
): void {
  const floor = resolvePlanFloorDateString(plan, now);
  if (floor && targetDate < floor) {
    throw new HttpError(
      403,
      `Free プランでは直近${FREE_PLAN_HISTORY_MONTHS}か月分の取引のみ参照・登録・更新できます`,
      'PLAN_RESTRICTED',
    );
  }
}

/**
 * Clamps a `from` query param up to the plan's floor date so free-plan list/aggregation
 * requests silently narrow to the accessible window instead of erroring. Returns `from`
 * unchanged for `paid` (no floor) or when it's already within (or narrower than) the window.
 */
export function clampFromParam(
  plan: UserPlan,
  from: string | undefined,
  now: Date = new Date(),
): string | undefined {
  const floor = resolvePlanFloorDateString(plan, now);
  if (!floor) return from;
  if (!from || from < floor) return floor;
  return from;
}

/**
 * Same idea as {@link clampFromParam} but for `YYYY-MM` budget-variance requests: clamps
 * `yearMonth` up to the plan's floor month.
 */
export function clampYearMonthParam(
  plan: UserPlan,
  yearMonth: string,
  now: Date = new Date(),
): string {
  const floor = resolvePlanFloorDateString(plan, now);
  if (!floor) return yearMonth;
  const floorMonth = floor.slice(0, 7);
  return yearMonth < floorMonth ? floorMonth : yearMonth;
}
