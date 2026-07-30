import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BudgetVarianceRow, CategoryPivotRow, TrendGranularity, TrendPoint } from '@household/shared';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TrendChart } from '@/components/charts/TrendChart';
import { AssetFormationChart } from '@/components/charts/AssetFormationChart';
import { BudgetVarianceList } from '@/components/charts/BudgetVarianceList';
import { CategoryBreakdownChart } from '@/components/charts/CategoryBreakdownChart';
import { SummaryStatTiles } from '@/components/charts/SummaryStatTiles';
import { getBudgetVariance, getCategoryPivot, getTrend } from '@/lib/aggregation';
import { toCumulativeSeries } from '@/lib/assetFormation';
import {
  currentYearMonthJst,
  formatYearMonth,
  monthDateRange,
  previousYearMonth,
  todayJst,
  yearDateRange,
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

/** 収支推移グラフの粒度に応じた取得範囲。日/週は選択月、月は選択年、年は選択に関わらず全履歴。 */
function trendRangeFor(granularity: TrendGranularity, selectedYearMonth: string): { from?: string; to: string } {
  if (granularity === 'year') {
    return { to: todayJst() };
  }
  if (granularity === 'month') {
    return yearDateRange(selectedYearMonth.slice(0, 4));
  }
  return monthDateRange(selectedYearMonth);
}

export default function DashboardPage() {
  const [granularity, setGranularity] = useState<TrendGranularity>('day');
  const [selectedYearMonth, setSelectedYearMonth] = useState(currentYearMonthJst());
  const yearMonth = selectedYearMonth;
  const previousMonth = previousYearMonth(yearMonth);
  const currentMonth = currentYearMonthJst();

  const trendRange = trendRangeFor(granularity, selectedYearMonth);
  const trendQuery = useQuery({
    queryKey: ['aggregation', 'trend', granularity, trendRange.from ?? null, trendRange.to],
    queryFn: async () => getTrend({ granularity, ...trendRange }),
  });

  const kpiRangeTo = monthDateRange(yearMonth).to;
  const kpiTrendQuery = useQuery({
    queryKey: ['aggregation', 'trend', 'month', previousMonth, kpiRangeTo],
    queryFn: async () => getTrend({ granularity: 'month', from: `${previousMonth}-01`, to: kpiRangeTo }),
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
    queryKey: ['aggregation', 'trend', 'month', 'all-history'],
    queryFn: async () => getTrend({ granularity: 'month', to: todayJst() }),
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">ダッシュボード</h1>
          <p className="text-sm text-muted-foreground">収支の推移と予算の状況を確認できます</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={selectedYearMonth}
            max={currentMonth}
            onChange={(e) => setSelectedYearMonth(e.target.value)}
            className="w-40"
            aria-label="表示する年月"
          />
          {selectedYearMonth !== currentMonth && (
            <Button variant="outline" size="sm" onClick={() => setSelectedYearMonth(currentMonth)}>
              今月に戻す
            </Button>
          )}
        </div>
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
            <CardTitle>予実差（費目別）</CardTitle>
            <CardDescription>{formatYearMonth(yearMonth)} の予算に対する実績</CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetVarianceList
              rows={budgetVarianceQuery.data ?? EMPTY_BUDGET_VARIANCE_ROWS}
              yearMonth={yearMonth}
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
