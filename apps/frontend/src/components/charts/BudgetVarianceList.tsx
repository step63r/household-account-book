import { TrendingDown, TrendingUp } from 'lucide-react';
import type { BudgetVarianceRow } from '@household/shared';
import { Skeleton } from '@/components/ui/skeleton';

const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

/** 予実差の表示エリア（費目別、当月）。バー(メーター)+ステータス色で over/under を示す。 */
export function BudgetVarianceList({
  rows,
  isLoading,
}: {
  rows: BudgetVarianceRow[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <ul className="flex flex-col gap-4" aria-label="予実差を読み込み中" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-3 w-20" />
          </li>
        ))}
      </ul>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        当月の予算・実績データがありません
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row) => {
        const isOverBudget = row.varianceAmount > 0;
        const ratio =
          row.budgetAmount > 0 ? Math.min(row.actualAmount / row.budgetAmount, 1.5) : row.actualAmount > 0 ? 1.5 : 0;
        const widthPercent = Math.min(ratio * 100, 100);

        return (
          <li key={row.categoryId} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{row.categoryName}</span>
              <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                {yenFormatter.format(row.actualAmount)} / {yenFormatter.format(row.budgetAmount)}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-valuenow={row.actualAmount}
              aria-valuemin={0}
              aria-valuemax={row.budgetAmount || row.actualAmount}
              aria-label={`${row.categoryName} 予算実績`}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${widthPercent}%`,
                  backgroundColor: isOverBudget ? 'var(--status-critical)' : 'var(--status-good)',
                }}
              />
            </div>
            <div className="flex items-center gap-1 text-xs">
              {isOverBudget ? (
                <TrendingUp className="size-3.5" style={{ color: 'var(--status-critical)' }} aria-hidden="true" />
              ) : (
                <TrendingDown className="size-3.5" style={{ color: 'var(--status-good)' }} aria-hidden="true" />
              )}
              <span
                className="font-medium tabular-nums"
                style={{ color: isOverBudget ? 'var(--status-critical)' : 'var(--status-good)' }}
              >
                {isOverBudget ? '+' : ''}
                {yenFormatter.format(row.varianceAmount)}
              </span>
              <span className="text-muted-foreground">{isOverBudget ? '予算超過' : '予算内'}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
