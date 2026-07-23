/**
 * 集計ロジック（クライアント側の暫定実装）。
 *
 * CLAUDE.md の方針では集計（日次/週次/月次推移・費目別ピボット・予実差）は
 * バックエンド（Lambda）がインメモリで行う想定。バックエンド未実装の間、
 * ダッシュボード等を成立させるためにフロントで同等のロジックを暫定的に持つ。
 *
 * 重要: `transfer` 種別は収支推移・予実差の集計から必ず除外する
 * （積立・投資・保険・NISA拠出などの資産振替のため）。
 */
import type {
  Budget,
  BudgetVarianceRow,
  Category,
  CategoryPivotRow,
  Transaction,
  TrendGranularity,
  TrendPoint,
} from '@household/shared';

function getIsoWeekPeriod(date: string): string {
  const d = new Date(`${date}T00:00:00`);
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
  return getIsoWeekPeriod(date);
}

/** transfer を除外した収支推移。日/週/月粒度で集計する。 */
export function computeTrend(
  transactions: readonly Transaction[],
  granularity: TrendGranularity,
): TrendPoint[] {
  const buckets = new Map<string, { income: number; expense: number }>();

  for (const tx of transactions) {
    if (tx.type === 'transfer') continue;
    const period = periodOf(tx.date, granularity);
    const bucket = buckets.get(period) ?? { income: 0, expense: 0 };
    if (tx.type === 'income') {
      bucket.income += tx.amount;
    } else {
      bucket.expense += tx.amount;
    }
    buckets.set(period, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, { income, expense }]) => ({ period, income, expense }));
}

export type AssetFormationPoint = {
  period: string;
  amount: number;
};

/** transfer のみを対象にした「資産形成推移」。収支推移とは別枠で扱う。 */
export function computeAssetFormationTrend(
  transactions: readonly Transaction[],
  granularity: TrendGranularity,
): AssetFormationPoint[] {
  const buckets = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== 'transfer') continue;
    const period = periodOf(tx.date, granularity);
    buckets.set(period, (buckets.get(period) ?? 0) + tx.amount);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, amount]) => ({ period, amount }));
}

/** 費目別ピボット（収支のみ、transfer は除外） */
export function computeCategoryPivot(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  granularity: TrendGranularity,
): CategoryPivotRow[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const rows = new Map<string, CategoryPivotRow>();

  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.categoryId) continue;
    const category = categoryById.get(tx.categoryId);
    const categoryName = category?.name ?? '未分類';
    const period = periodOf(tx.date, granularity);
    const row = rows.get(tx.categoryId) ?? {
      categoryId: tx.categoryId,
      categoryName,
      amountsByPeriod: {},
    };
    row.amountsByPeriod[period] = (row.amountsByPeriod[period] ?? 0) + tx.amount;
    rows.set(tx.categoryId, row);
  }

  return [...rows.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'ja'));
}

/** 予実差（当月・費目別、expense のみ） */
export function computeBudgetVariance(
  transactions: readonly Transaction[],
  budgets: readonly Budget[],
  categories: readonly Category[],
  yearMonth: string,
): BudgetVarianceRow[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const actualByCategory = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.categoryId) continue;
    if (!tx.date.startsWith(yearMonth)) continue;
    actualByCategory.set(tx.categoryId, (actualByCategory.get(tx.categoryId) ?? 0) + tx.amount);
  }

  const monthBudgets = budgets.filter((b) => b.yearMonth === yearMonth);
  const categoryIds = new Set([
    ...monthBudgets.map((b) => b.categoryId),
    ...actualByCategory.keys(),
  ]);

  return [...categoryIds]
    .map((categoryId) => {
      const category = categoryById.get(categoryId);
      const budgetAmount = monthBudgets.find((b) => b.categoryId === categoryId)?.amount ?? 0;
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
