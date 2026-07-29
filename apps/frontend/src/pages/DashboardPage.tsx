import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BudgetVarianceRow, CategoryPivotRow, TrendGranularity, TrendPoint } from '@household/shared';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendChart } from '@/components/charts/TrendChart';
import { AssetFormationChart } from '@/components/charts/AssetFormationChart';
import { BudgetVarianceList } from '@/components/charts/BudgetVarianceList';
import { CategoryBreakdownChart } from '@/components/charts/CategoryBreakdownChart';
import { SummaryStatTiles } from '@/components/charts/SummaryStatTiles';
import { getBudgetVariance, getCategoryPivot, getTrend } from '@/lib/aggregation';
import { toCumulativeSeries } from '@/lib/assetFormation';
import {
  currentYearJst,
  currentYearMonthJst,
  formatYearMonth,
  monthDateRange,
  previousYearMonth,
  todayJst,
} from '@/lib/date';
import { EMPTY_ARRAY } from '@/lib/utils';

const GRANULARITY_LABEL: Record<TrendGranularity, string> = {
  day: '日次',
  week: '週次',
  month: '月次',
  year: '年次',
};

// EMPTY_ARRAY（readonly never[]）はコンポーネントのprops（mutableな配列型）に直接渡せないため、
// チャート/一覧コンポーネントへのフォールバック用に型付きの空配列を用意する。
const EMPTY_TREND_POINTS: TrendPoint[] = [];
const EMPTY_BUDGET_VARIANCE_ROWS: BudgetVarianceRow[] = [];
const EMPTY_CATEGORY_PIVOT_ROWS: CategoryPivotRow[] = [];

/** 収支推移グラフの粒度に応じた取得範囲。日/週は当月、年は当年、月は全履歴。 */
function trendRangeFor(granularity: TrendGranularity): { from?: string; to: string } {
  const to = todayJst();
  if (granularity === 'year') {
    return { from: `${currentYearJst()}-01-01`, to };
  }
  if (granularity === 'month') {
    return { to };
  }
  return { from: `${currentYearMonthJst()}-01`, to };
}

export default function DashboardPage() {
  const [granularity, setGranularity] = useState<TrendGranularity>('day');
  const yearMonth = currentYearMonthJst();
  const previousMonth = previousYearMonth(yearMonth);
  const today = todayJst();

  const trendRange = trendRangeFor(granularity);
  const trendQuery = useQuery({
    queryKey: ['aggregation', 'trend', granularity, trendRange.from ?? null, trendRange.to],
    queryFn: async () => getTrend({ granularity, ...trendRange }),
  });

  const kpiTrendQuery = useQuery({
    queryKey: ['aggregation', 'trend', 'month', previousMonth, today],
    queryFn: async () => getTrend({ granularity: 'month', from: `${previousMonth}-01`, to: today }),
  });

  const categoryPivotQuery = useQuery({
    queryKey: ['aggregation', 'category-pivot', yearMonth],
    queryFn: async () => getCategoryPivot(monthDateRange(yearMonth)),
  });

  const budgetVarianceQuery = useQuery({
    queryKey: ['aggregation', 'budget-variance', yearMonth],
    queryFn: async () => getBudgetVariance(yearMonth),
  });

  const assetFormationQuery = useQuery({
    queryKey: ['aggregation', 'trend', 'month', 'all-history', today],
    queryFn: async () => getTrend({ granularity: 'month', to: today }),
  });

  const isInitialLoading =
    trendQuery.isPending ||
    kpiTrendQuery.isPending ||
    categoryPivotQuery.isPending ||
    budgetVarianceQuery.isPending ||
    assetFormationQuery.isPending;

  const assetFormationData = useMemo(
    () => toCumulativeSeries(assetFormationQuery.data ?? EMPTY_ARRAY),
    [assetFormationQuery.data],
  );

  const currentKpiPoint = kpiTrendQuery.data?.find((point) => point.period === yearMonth);
  const previousKpiPoint = kpiTrendQuery.data?.find((point) => point.period === previousMonth);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">ダッシュボード</h1>
        <p className="text-sm text-muted-foreground">収支の推移と予算の状況を確認できます</p>
      </div>

      <SummaryStatTiles
        currentIncome={currentKpiPoint?.income ?? 0}
        currentExpense={currentKpiPoint?.expense ?? 0}
        previousIncome={previousKpiPoint?.income ?? 0}
        previousExpense={previousKpiPoint?.expense ?? 0}
        isLoading={isInitialLoading}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>収支推移</CardTitle>
              <CardDescription>収入・支出の推移（振替は含みません）</CardDescription>
            </div>
            <Tabs value={granularity} onValueChange={(v) => setGranularity(v as TrendGranularity)}>
              <TabsList>
                {(Object.keys(GRANULARITY_LABEL) as TrendGranularity[]).map((g) => (
                  <TabsTrigger key={g} value={g}>
                    {GRANULARITY_LABEL[g]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <TrendChart
            data={trendQuery.data ?? EMPTY_TREND_POINTS}
            granularity={granularity}
            isLoading={isInitialLoading}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>予実差（当月・費目別）</CardTitle>
            <CardDescription>{formatYearMonth(yearMonth)} の予算に対する実績</CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetVarianceList
              rows={budgetVarianceQuery.data ?? EMPTY_BUDGET_VARIANCE_ROWS}
              isLoading={isInitialLoading}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>費目別支出の内訳</CardTitle>
            <CardDescription>{formatYearMonth(yearMonth)} の支出（費目別）</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBreakdownChart
              rows={categoryPivotQuery.data ?? EMPTY_CATEGORY_PIVOT_ROWS}
              yearMonth={yearMonth}
              isLoading={isInitialLoading}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>資産形成推移</CardTitle>
            <CardDescription>積立・投資・保険・NISA拠出などの振替のみを集計（収支には含みません）</CardDescription>
          </CardHeader>
          <CardContent>
            <AssetFormationChart data={assetFormationData} isLoading={isInitialLoading} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
