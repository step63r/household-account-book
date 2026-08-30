import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendGranularity, TrendPoint } from '@household/shared';
import { formatPeriodTick } from '@/lib/date';
import { formatManYenTick } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { BAR_SKELETON_HEIGHTS, CustomTooltip } from '@/components/charts/TrendChart';

/** 月/年の収支推移グラフ。ゼロ基準線を境に、収入をプラス方向（青）、支出をマイナス方向（赤）に
 * 積み上げた発散型（diverging）棒グラフとして1期間1本で表示する（transfer は含まない）。 */
export function IncomeExpenseTrendChart({
  data,
  granularity,
  isLoading,
}: {
  data: TrendPoint[];
  granularity: TrendGranularity;
  isLoading?: boolean;
}) {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        period: point.period,
        income: point.income,
        expenseNegated: -point.expense,
      })),
    [data],
  );

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
        {/* stackOffset="sign" が無いと同じstackId内の正負の値が単純に加算され、
            マイナス側がゼロ基準に分かれず正の棒に重なって表示されてしまう */}
        <BarChart
          data={chartData}
          stackOffset="sign"
          barGap={4}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
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
          <ReferenceLine y={0} stroke="var(--chart-axis)" />
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
            stackId="net"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="expenseNegated"
            name="支出"
            fill="var(--series-expense)"
            stackId="net"
            // 負の値のバーはRechartsがradius配列の丸め位置を反転して描画するため、
            // 収入と同じ[4,4,0,0]を指定することでゼロ基準線側が角、先端側が丸くなる
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
