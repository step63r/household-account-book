import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AssetFormationPoint } from '@/lib/aggregate';

const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  if (!point) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      <p className="font-medium tabular-nums text-[var(--series-transfer)]">
        {yenFormatter.format(point.value)}
      </p>
    </div>
  );
}

/**
 * 資産形成推移（積立・投資・保険・NISA拠出などの transfer 種別のみを集計）。
 * 収支推移・予実差とは別枠のグラフとして扱う。
 */
export function AssetFormationChart({ data }: { data: AssetFormationPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        振替（積立・投資など）の記録がありません
      </div>
    );
  }

  return (
    <div className="h-56 w-full" role="img" aria-label="資産形成推移グラフ">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="assetFormationFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-transfer)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--series-transfer)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="period"
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--chart-axis)' }}
          />
          <YAxis
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-muted)', fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--chart-axis)' }} />
          <Area
            type="monotone"
            dataKey="amount"
            name="積立・投資等"
            stroke="var(--series-transfer)"
            strokeWidth={2}
            fill="url(#assetFormationFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
