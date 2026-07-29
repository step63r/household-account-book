/**
 * 資産形成推移（累計）の変換ロジック。バックエンドの `getTrend`（granularity: 'month'）が
 * 返す期間ごとの `transfer` 合計を、`AssetFormationChart` が描画する累計系列に変換する。
 */
import type { TrendPoint } from '@household/shared';
import type { CumulativeAssetPoint } from '@/components/charts/AssetFormationChart';

/** 昇順の TrendPoint[] を、transfer の累計額を積み上げた CumulativeAssetPoint[] に変換する。 */
export function toCumulativeSeries(points: readonly TrendPoint[]): CumulativeAssetPoint[] {
  let runningTotal = 0;
  return points.map((point) => {
    runningTotal += point.transfer;
    return { period: point.period, amount: runningTotal };
  });
}
