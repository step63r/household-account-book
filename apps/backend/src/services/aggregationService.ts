import { z } from 'zod';
import {
  trendGranularitySchema,
  yearMonthSchema,
  type BudgetVarianceRow,
  type CategoryPivotRow,
  type TrendGranularity,
  type TrendPoint,
} from '@household/shared';
import type { BudgetRepository } from '../repository/budgetRepository';
import type { CategoryRepository } from '../repository/categoryRepository';
import type { TransactionRepository } from '../repository/transactionRepository';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

const trendQuerySchema = z.object({
  granularity: trendGranularitySchema,
  from: dateSchema.optional(),
  to: dateSchema,
});

const categoryPivotQuerySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  granularity: trendGranularitySchema.default('month'),
});

const budgetVarianceQuerySchema = z.object({
  yearMonth: yearMonthSchema,
});

const memoSuggestionsQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

const MEMO_SUGGESTIONS_LIMIT = 20;

/** ISO 8601 week ('YYYY-Www'), matching apps/frontend/src/lib/aggregate.ts's client-side
 * implementation so trend/pivot buckets stay identical once the frontend switches to this API. */
function isoWeekPeriod(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const target = new Date(d.valueOf());
  const dayNumber = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function periodOf(date: string, granularity: TrendGranularity): string {
  if (granularity === 'day') return date;
  if (granularity === 'month') return date.slice(0, 7);
  if (granularity === 'year') return date.slice(0, 4);
  return isoWeekPeriod(date);
}

/**
 * 収支（income/expense）推移。日/週/月/年粒度で集計する（CLAUDE.mdのtransfer除外ルール）。
 * transferはincome/expenseの集計からは除外しつつ、フロントの資産形成推移（累計）チャートで
 * 再利用できるよう期間ごとの合計を並行して`transfer`フィールドに持たせる。
 */
export async function getTrend(
  transactionRepository: TransactionRepository,
  userId: string,
  rawQuery: unknown,
): Promise<TrendPoint[]> {
  const { granularity, from, to } = trendQuerySchema.parse(rawQuery);
  const transactions = await transactionRepository.listByUser(userId, { from, to });

  const buckets = new Map<string, { income: number; expense: number; transfer: number }>();
  for (const transaction of transactions) {
    const period = periodOf(transaction.date, granularity);
    const bucket = buckets.get(period) ?? { income: 0, expense: 0, transfer: 0 };
    if (transaction.type === 'income') {
      bucket.income += transaction.amount;
    } else if (transaction.type === 'expense') {
      bucket.expense += transaction.amount;
    } else {
      bucket.transfer += transaction.amount;
    }
    buckets.set(period, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, { income, expense, transfer }]) => ({ period, income, expense, transfer }));
}

/** 費目別ピボット（expenseのみ、transferだけでなくincomeも除外 - 費目集計の対象は支出）。 */
export async function getCategoryPivot(
  transactionRepository: TransactionRepository,
  categoryRepository: CategoryRepository,
  userId: string,
  rawQuery: unknown,
): Promise<CategoryPivotRow[]> {
  const { from, to, granularity } = categoryPivotQuerySchema.parse(rawQuery);
  const [transactions, categories] = await Promise.all([
    transactionRepository.listByUser(userId, { from, to }),
    categoryRepository.listByUser(userId),
  ]);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const rows = new Map<string, CategoryPivotRow>();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || !transaction.categoryId) continue;
    const categoryName = categoryById.get(transaction.categoryId)?.name ?? '未分類';
    const period = periodOf(transaction.date, granularity);
    const row = rows.get(transaction.categoryId) ?? {
      categoryId: transaction.categoryId,
      categoryName,
      amountsByPeriod: {},
    };
    row.amountsByPeriod[period] = (row.amountsByPeriod[period] ?? 0) + transaction.amount;
    rows.set(transaction.categoryId, row);
  }

  return [...rows.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'ja'));
}

/** 予実差（指定月・費目別、expenseのみ）。budgetsとactualsの両方に現れる費目を和集合で列挙する。 */
export async function getBudgetVariance(
  transactionRepository: TransactionRepository,
  budgetRepository: BudgetRepository,
  categoryRepository: CategoryRepository,
  userId: string,
  rawQuery: unknown,
): Promise<BudgetVarianceRow[]> {
  const { yearMonth } = budgetVarianceQuerySchema.parse(rawQuery);
  // Lexicographic bound over YYYY-MM-DD strings: "-31" safely covers every month's actual
  // last day (a nonexistent "-31" for a 30-day month just matches nothing extra).
  const [transactions, budgets, categories] = await Promise.all([
    transactionRepository.listByUser(userId, { from: `${yearMonth}-01`, to: `${yearMonth}-31` }),
    budgetRepository.listByUserAndMonth(userId, yearMonth),
    categoryRepository.listByUser(userId),
  ]);
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const actualByCategory = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || !transaction.categoryId) continue;
    actualByCategory.set(
      transaction.categoryId,
      (actualByCategory.get(transaction.categoryId) ?? 0) + transaction.amount,
    );
  }

  const categoryIds = new Set([...budgets.map((b) => b.categoryId), ...actualByCategory.keys()]);

  // Matches the frontend's (now superseded) client-side computeBudgetVariance ordering:
  // fixed categories before variable, then by sortOrder, with missing categories (未分類) last.
  const categoryTypeOrder: Record<'fixed' | 'variable', number> = { fixed: 0, variable: 1 };

  return [...categoryIds]
    .map((categoryId) => {
      const category = categoryById.get(categoryId);
      const budgetAmount = budgets.find((b) => b.categoryId === categoryId)?.amount ?? 0;
      const actualAmount = actualByCategory.get(categoryId) ?? 0;
      const row: BudgetVarianceRow = {
        categoryId,
        categoryName: category?.name ?? '未分類',
        budgetAmount,
        actualAmount,
        varianceAmount: actualAmount - budgetAmount,
      };
      return { row, category };
    })
    .sort((a, b) => {
      const typeOrderA = a.category ? categoryTypeOrder[a.category.type] : 2;
      const typeOrderB = b.category ? categoryTypeOrder[b.category.type] : 2;
      if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
      const sortOrderA = a.category?.sortOrder ?? Infinity;
      const sortOrderB = b.category?.sortOrder ?? Infinity;
      if (sortOrderA !== sortOrderB) return sortOrderA - sortOrderB;
      return a.row.categoryName.localeCompare(b.row.categoryName, 'ja');
    })
    .map(({ row }) => row);
}

/**
 * 摘要のサジェスト候補。空文字を除いた過去のmemoを重複除去し、直近使用日→使用回数の順で
 * 上位{@link MEMO_SUGGESTIONS_LIMIT}件を返す。from/to省略時は全履歴が対象。
 */
export async function getMemoSuggestions(
  transactionRepository: TransactionRepository,
  userId: string,
  rawQuery: unknown,
): Promise<string[]> {
  const { from, to } = memoSuggestionsQuerySchema.parse(rawQuery);
  const transactions = await transactionRepository.listByUser(userId, { from, to });

  const stats = new Map<string, { count: number; lastUsedAt: string }>();
  for (const transaction of transactions) {
    const memo = transaction.memo?.trim();
    if (!memo) continue;
    const existing = stats.get(memo);
    if (existing) {
      existing.count += 1;
      if (transaction.date > existing.lastUsedAt) existing.lastUsedAt = transaction.date;
    } else {
      stats.set(memo, { count: 1, lastUsedAt: transaction.date });
    }
  }

  return [...stats.entries()]
    .sort(([, a], [, b]) => b.lastUsedAt.localeCompare(a.lastUsedAt) || b.count - a.count)
    .slice(0, MEMO_SUGGESTIONS_LIMIT)
    .map(([memo]) => memo);
}
