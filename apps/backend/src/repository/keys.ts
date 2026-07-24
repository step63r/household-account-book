/**
 * Single-table key scheme (see repo root CLAUDE.md):
 *   USER#<userId>                          partition key for every item owned by a user
 *   PROFILE                                user profile/account-status sort key (one per user)
 *   TXN#<date>#<txnId>                     transaction sort key (date is YYYY-MM-DD, sorts chronologically)
 *   CATEGORY#<categoryId>                  category sort key
 *   BUDGET#<yyyymm>#<categoryId>           monthly per-category budget sort key
 */

export function userPk(userId: string): string {
  return `USER#${userId}`;
}

/** Sort key for the single per-user profile item (status, withdrawal timestamps, etc.). */
export const PROFILE_SK = 'PROFILE';

export function transactionSk(date: string, txnId: string): string {
  return `TXN#${date}#${txnId}`;
}

/** Sort-key prefix for a Query across all of a user's transactions (or a date-bounded range). */
export const TRANSACTION_SK_PREFIX = 'TXN#';

export function categorySk(categoryId: string): string {
  return `CATEGORY#${categoryId}`;
}

export const CATEGORY_SK_PREFIX = 'CATEGORY#';

export function budgetSk(yearMonth: string, categoryId: string): string {
  return `BUDGET#${yearMonth}#${categoryId}`;
}

export const BUDGET_SK_PREFIX = 'BUDGET#';
