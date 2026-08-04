/**
 * Single-table key scheme (see repo root CLAUDE.md):
 *   USER#<userId>                          partition key for the per-user PROFILE item only
 *                                           (account status, plan, and a reference to the
 *                                           household the user belongs to - see household.ts)
 *   HOUSEHOLD#<householdId>                partition key for every item shared by a household
 *                                           (transactions/categories/budgets, plus the
 *                                           household's own PROFILE/MEMBER# items)
 *   INVITE#<token>                         partition key for a pending household invite
 *   PROFILE                                sort key for the single per-user or per-household
 *                                           profile item (one per USER# or HOUSEHOLD# partition)
 *   MEMBER#<userId>                        household membership sort key
 *   METADATA                               sort key for the single per-invite item
 *   TXN#<date>#<txnId>                     transaction sort key (date is YYYY-MM-DD, sorts chronologically)
 *   CATEGORY#<categoryId>                  category sort key
 *   BUDGET#<yyyymm>#<categoryId>           monthly per-category budget sort key
 */

export function userPk(userId: string): string {
  return `USER#${userId}`;
}

export function householdPk(householdId: string): string {
  return `HOUSEHOLD#${householdId}`;
}

export function invitePk(token: string): string {
  return `INVITE#${token}`;
}

/** Sort key for the single per-user or per-household profile item. */
export const PROFILE_SK = 'PROFILE';

/** Sort key for the single per-invite item. */
export const INVITE_SK = 'METADATA';

export function memberSk(userId: string): string {
  return `MEMBER#${userId}`;
}

/** Sort-key prefix for a Query across all members of a household. */
export const MEMBER_SK_PREFIX = 'MEMBER#';

export function transactionSk(date: string, txnId: string): string {
  return `TXN#${date}#${txnId}`;
}

/** Sort-key prefix for a Query across all of a household's transactions (or a date-bounded range). */
export const TRANSACTION_SK_PREFIX = 'TXN#';

export function categorySk(categoryId: string): string {
  return `CATEGORY#${categoryId}`;
}

export const CATEGORY_SK_PREFIX = 'CATEGORY#';

export function budgetSk(yearMonth: string, categoryId: string): string {
  return `BUDGET#${yearMonth}#${categoryId}`;
}

export const BUDGET_SK_PREFIX = 'BUDGET#';
