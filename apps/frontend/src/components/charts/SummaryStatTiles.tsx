import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatYen } from '@/lib/format';

type StatTileDatum = {
  label: string;
  /** 円額、または比率（0〜1、format: 'percent' の場合） */
  value: number;
  previousValue: number;
  format: 'yen' | 'percent';
  /** 値が増える方向が「良い」変化かどうか（支出タイルは 'down'） */
  goodDirection: 'up' | 'down';
};

function formatTileValue(datum: StatTileDatum): string {
  if (datum.format === 'percent') {
    if (!Number.isFinite(datum.value)) return '—';
    return `${(datum.value * 100).toFixed(1)}%`;
  }
  return formatYen(datum.value);
}

function DeltaBadge({ datum }: { datum: StatTileDatum }) {
  if (datum.format === 'percent') {
    // 貯蓄率は当月・前月いずれかの収入が0だと定義できないため、デルタごと表示しない
    if (!Number.isFinite(datum.value) || !Number.isFinite(datum.previousValue)) {
      return null;
    }
    const deltaPt = (datum.value - datum.previousValue) * 100;
    const isGood = datum.goodDirection === 'up' ? deltaPt >= 0 : deltaPt <= 0;
    const Icon = deltaPt >= 0 ? TrendingUp : TrendingDown;
    return (
      <span
        className="flex items-center gap-1 text-xs font-medium tabular-nums"
        style={{ color: isGood ? 'var(--status-good)' : 'var(--status-critical)' }}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {deltaPt >= 0 ? '+' : ''}
        {deltaPt.toFixed(1)}pt
      </span>
    );
  }

  if (datum.previousValue === 0) {
    return <span className="text-xs text-muted-foreground">前月データなし</span>;
  }
  // 差引残高はマイナスになり得るため、分母は絶対値を使い符号の反転を防ぐ
  const deltaRatio = (datum.value - datum.previousValue) / Math.abs(datum.previousValue);
  const isGood = datum.goodDirection === 'up' ? deltaRatio >= 0 : deltaRatio <= 0;
  const Icon = deltaRatio >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className="flex items-center gap-1 text-xs font-medium tabular-nums"
      style={{ color: isGood ? 'var(--status-good)' : 'var(--status-critical)' }}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {deltaRatio >= 0 ? '+' : ''}
      {(deltaRatio * 100).toFixed(1)}%
    </span>
  );
}

function StatTile({ datum }: { datum: StatTileDatum }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{datum.label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="text-2xl font-semibold tabular-nums">{formatTileValue(datum)}</span>
        <DeltaBadge datum={datum} />
      </CardContent>
    </Card>
  );
}

/** 当月のKPIタイル（収入・支出・差引残高・貯蓄率）。前月比の変化を併記する。 */
export function SummaryStatTiles({
  currentIncome,
  currentExpense,
  previousIncome,
  previousExpense,
  isLoading,
}: {
  currentIncome: number;
  currentExpense: number;
  previousIncome: number;
  previousExpense: number;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="サマリーを読み込み中" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-16" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const currentBalance = currentIncome - currentExpense;
  const previousBalance = previousIncome - previousExpense;
  // 貯蓄率 = 差引残高 / 収入。transferは元々expenseに含まれていないため二重計上にならない。
  const currentSavingsRate = currentIncome !== 0 ? currentBalance / currentIncome : NaN;
  const previousSavingsRate = previousIncome !== 0 ? previousBalance / previousIncome : NaN;

  const tiles: StatTileDatum[] = [
    { label: '収入', value: currentIncome, previousValue: previousIncome, format: 'yen', goodDirection: 'up' },
    { label: '支出', value: currentExpense, previousValue: previousExpense, format: 'yen', goodDirection: 'down' },
    {
      label: '差引残高',
      value: currentBalance,
      previousValue: previousBalance,
      format: 'yen',
      goodDirection: 'up',
    },
    {
      label: '貯蓄率',
      value: currentSavingsRate,
      previousValue: previousSavingsRate,
      format: 'percent',
      goodDirection: 'up',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <StatTile key={tile.label} datum={tile} />
      ))}
    </div>
  );
}
