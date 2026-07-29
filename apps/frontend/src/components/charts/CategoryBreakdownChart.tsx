import type { CategoryPivotRow } from '@household/shared';
import { formatYen } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';

const TOP_N = 6;
const OTHER_CATEGORY_ID = '__other__';
const OTHER_LABEL = 'その他';

type BreakdownRow = {
  categoryId: string;
  categoryName: string;
  amount: number;
};

function buildBreakdown(
  rows: readonly CategoryPivotRow[],
  yearMonth: string,
): { rows: BreakdownRow[]; total: number } {
  const withAmount = rows
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      amount: row.amountsByPeriod[yearMonth] ?? 0,
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const total = withAmount.reduce((sum, row) => sum + row.amount, 0);

  if (withAmount.length <= TOP_N) {
    return { rows: withAmount, total };
  }

  const top = withAmount.slice(0, TOP_N);
  const otherAmount = withAmount.slice(TOP_N).reduce((sum, row) => sum + row.amount, 0);
  return {
    rows: [...top, { categoryId: OTHER_CATEGORY_ID, categoryName: OTHER_LABEL, amount: otherAmount }],
    total,
  };
}

/** 当月の費目別支出の内訳（上位6費目 + その他）。BudgetVarianceListと同じメーターバー形式。 */
export function CategoryBreakdownChart({
  rows,
  yearMonth,
  isLoading,
}: {
  rows: CategoryPivotRow[];
  yearMonth: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <ul className="flex flex-col gap-4" aria-label="費目別支出の内訳を読み込み中" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </li>
        ))}
      </ul>
    );
  }

  const { rows: breakdownRows, total } = buildBreakdown(rows, yearMonth);

  if (breakdownRows.length === 0 || total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        当月の支出データがありません
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {breakdownRows.map((row) => {
        const percent = (row.amount / total) * 100;
        return (
          <li key={row.categoryId} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{row.categoryName}</span>
              <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                {formatYen(row.amount)}（{percent.toFixed(1)}%）
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-valuenow={row.amount}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label={`${row.categoryName} 支出割合`}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${percent}%`, backgroundColor: 'var(--series-expense)' }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
