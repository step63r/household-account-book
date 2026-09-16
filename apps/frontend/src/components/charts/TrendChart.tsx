import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendGranularity, TrendPoint } from '@household/shared';
import { formatPeriodLabel, formatPeriodTick } from '@/lib/date';
import { formatManYenTick, formatYen } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';

export const BAR_SKELETON_HEIGHTS = [55, 80, 40, 95, 60, 75, 45];

/** Barの`fill`はグラデーション(`url(#...)`)を指定しているため、Rechartsが
 * ツールチップ用に生成する`entry.color`もその文字列になりCSSの`background-color`
 * には使えない（アイコンが透明になる）。dataKeyから実際の系列色を引き直す。 */
const SERIES_COLOR_BY_DATA_KEY: Record<string, string> = {
  expense: 'var(--series-expense)',
  income: 'var(--series-income)',
  expenseNegated: 'var(--series-expense)',
};

export function CustomTooltip({
  active,
  payload,
  label,
  granularity,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey?: string }[];
  label?: string;
  granularity: TrendGranularity;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-white/30 bg-popover/85 px-3 py-2 text-xs text-popover-foreground shadow-md backdrop-blur-xl">
      <p className="mb-1 font-medium">
        {label !== undefined ? formatPeriodLabel(label, granularity) : ''}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block size-2 rounded-full"
            style={{
              backgroundColor:
                (entry.dataKey && SERIES_COLOR_BY_DATA_KEY[entry.dataKey]) || entry.color,
            }}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium tabular-nums">{formatYen(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** 日/週/月/年の支出推移グラフ（expense のみ。transfer は含まない） */
export function TrendChart({
  data,
  granularity,
  isLoading,
}: {
  data: TrendPoint[];
  granularity: TrendGranularity;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div
        className="flex h-64 w-full items-end gap-3 px-1"
        role="img"
        aria-label="支出推移グラフを読み込み中"
        aria-busy="true"
      >
        {BAR_SKELETON_HEIGHTS.map((height, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <Skeleton className="w-full" style={{ height: `${height}%` }} />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        表示できる取引データがありません
      </div>
    );
  }

  return (
    <div className="h-64 w-full" role="img" aria-label="支出推移グラフ">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="expenseBarFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-expense)" stopOpacity={0.68} />
              <stop offset="100%" stopColor="var(--series-expense)" stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="period"
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-axis)' }}
            tickFormatter={(period: string) => formatPeriodTick(period, granularity)}
          />
          <YAxis
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={formatManYenTick}
          />
          <Tooltip
            content={<CustomTooltip granularity={granularity} />}
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: 'var(--chart-muted)' }}
            iconType="circle"
            iconSize={8}
          />
          <Bar
            dataKey="expense"
            name="支出"
            fill="url(#expenseBarFill)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
