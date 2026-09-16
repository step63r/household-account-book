import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { CategoryPivotRow } from '@household/shared';
import { formatYen } from '@/lib/format';
import { formatYearMonth } from '@/lib/date';
import { Skeleton } from '@/components/ui/skeleton';

const TOP_N = 6;
const OTHER_CATEGORY_ID = '__other__';
const OTHER_LABEL = 'その他';

const CATEGORY_COLORS = [
  'var(--category-1)',
  'var(--category-2)',
  'var(--category-3)',
  'var(--category-4)',
  'var(--category-5)',
  'var(--category-6)',
];
const OTHER_COLOR = 'var(--chart-muted)';

type BreakdownRow = {
  categoryId: string;
  categoryName: string;
  amount: number;
  color: string;
};

function colorForIndex(categoryId: string, index: number): string {
  return categoryId === OTHER_CATEGORY_ID ? OTHER_COLOR : (CATEGORY_COLORS[index] ?? OTHER_COLOR);
}

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

  const withoutColor =
    withAmount.length <= TOP_N
      ? withAmount
      : [
          ...withAmount.slice(0, TOP_N),
          {
            categoryId: OTHER_CATEGORY_ID,
            categoryName: OTHER_LABEL,
            amount: withAmount.slice(TOP_N).reduce((sum, row) => sum + row.amount, 0),
          },
        ];

  return {
    rows: withoutColor.map((row, index) => ({
      ...row,
      color: colorForIndex(row.categoryId, index),
    })),
    total,
  };
}

/** Rechartsの<Tooltip>はPieの各セクターの色（Cellのfill）をpayloadに含めないため、
 * 凡例の色と一致させるには自前でrowに保持させたcolorを使う必要がある。 */
function CustomTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { payload: BreakdownRow }[];
  total: number;
}) {
  const entry = active ? payload?.[0] : undefined;
  if (!entry) return null;
  const row = entry.payload;
  const percent = (row.amount / total) * 100;
  return (
    <div className="rounded-md border border-white/30 bg-popover/85 px-3 py-2 text-xs text-popover-foreground shadow-md backdrop-blur-xl">
      <p className="flex items-center gap-2">
        <span
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: row.color }}
          aria-hidden="true"
        />
        <span className="font-medium">{row.categoryName}</span>
      </p>
      <p className="mt-1 tabular-nums text-muted-foreground">
        {formatYen(row.amount)}（{percent.toFixed(1)}%）
      </p>
    </div>
  );
}

/** 当月の費目別支出の内訳（上位6費目 + その他）をドーナツグラフ＋凡例リストで表示する。 */
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
      <div
        className="flex flex-col items-center gap-6"
        aria-label="費目別支出の内訳を読み込み中"
        aria-busy="true"
      >
        <Skeleton className="size-40 shrink-0 rounded-full" />
        <ul className="flex w-full flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-2">
              <Skeleton className="size-2.5 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ml-auto h-4 w-20" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const { rows: breakdownRows, total } = buildBreakdown(rows, yearMonth);

  if (breakdownRows.length === 0 || total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        {formatYearMonth(yearMonth)}の支出データがありません
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-6"
      role="img"
      aria-label="費目別支出の内訳グラフ"
    >
      <div className="relative size-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={breakdownRows}
              dataKey="amount"
              nameKey="categoryName"
              innerRadius="62%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--chart-surface)"
              strokeWidth={2}
            >
              {breakdownRows.map((row) => (
                <Cell key={row.categoryId} fill={row.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip total={total} />} wrapperStyle={{ zIndex: 10 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">合計</span>
          <span className="text-sm font-medium tabular-nums">{formatYen(total)}</span>
        </div>
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-2.5">
        {breakdownRows.map((row) => {
          const percent = (row.amount / total) * 100;
          return (
            <li key={row.categoryId} className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden="true"
              />
              <span className="truncate font-medium">{row.categoryName}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {formatYen(row.amount)}（{percent.toFixed(1)}%）
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
