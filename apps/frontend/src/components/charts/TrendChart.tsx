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
import { Skeleton } from '@/components/ui/skeleton';

const BAR_SKELETON_HEIGHTS = [55, 80, 40, 95, 60, 75, 45];

const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

function CustomTooltip({
  active,
  payload,
  label,
  granularity,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  granularity: TrendGranularity;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{label !== undefined ? formatPeriodLabel(label, granularity) : ''}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium tabular-nums">
            {yenFormatter.format(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

/** 日/週/月の収支推移グラフ（income/expense のみ。transfer は含まない） */
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
        aria-label="収支推移グラフを読み込み中"
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
    <div className="h-64 w-full" role="img" aria-label="収支推移グラフ">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
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
            dataKey="income"
            name="収入"
            fill="var(--series-income)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="expense"
            name="支出"
            fill="var(--series-expense)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
