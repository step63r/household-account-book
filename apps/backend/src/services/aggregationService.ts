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
  from: dateSchema,
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
  return isoWeekPeriod(date);
}

/** transferを除外した収支推移。日/週/月粒度で集計する（CLAUDE.mdのtransfer除外ルール）。 */
export async function getTrend(
  transactionRepository: TransactionRepository,
  userId: string,
  rawQuery: unknown,
): Promise<TrendPoint[]> {
  const { granularity, from, to } = trendQuerySchema.parse(rawQuery);
  const transactions = await transactionRepository.listByUser(userId, { from, to });

  const buckets = new Map<string, { income: number; expense: number }>();
  for (const transaction of transactions) {
    if (transaction.type === 'transfer') continue;
    const period = periodOf(transaction.date, granularity);
    const bucket = buckets.get(period) ?? { income: 0, expense: 0 };
    if (transaction.type === 'income') {
      bucket.income += transaction.amount;
    } else {
      bucket.expense += transaction.amount;
    }
    buckets.set(period, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, { income, expense }]) => ({ period, income, expense }));
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
      return row;
    })
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'ja'));
}
