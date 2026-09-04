import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  BudgetVarianceRow,
  CategoryPivotRow,
  TrendGranularity,
  TrendPoint,
} from '@household/shared';
import { resolvePlanFloorDateString } from '@household/shared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { MonthNavigator } from '@/components/MonthNavigator';
import { TrendChart } from '@/components/charts/TrendChart';
import { IncomeExpenseTrendChart } from '@/components/charts/IncomeExpenseTrendChart';
import { AssetFormationChart } from '@/components/charts/AssetFormationChart';
import { BudgetVarianceList } from '@/components/charts/BudgetVarianceList';
import { CategoryBreakdownChart } from '@/components/charts/CategoryBreakdownChart';
import { SummaryStatTiles } from '@/components/charts/SummaryStatTiles';
import { PlanRestrictionNotice } from '@/components/plan/PlanRestrictionNotice';
import { getBudgetVariance, getCategoryPivot, getTrend } from '@/lib/aggregation';
import { isPlanRestrictedError } from '@/lib/api';
import { useUserProfile } from '@/lib/profile';
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

// 支出推移（短期の支出動向）は日次/週次のみ、収支推移（長期の収支バランス）は月次/年次のみに絞る。
const EXPENSE_TREND_GRANULARITIES: TrendGranularity[] = ['day', 'week'];
const INCOME_EXPENSE_TREND_GRANULARITIES: TrendGranularity[] = ['month', 'year'];

// EMPTY_ARRAY（readonly never[]）はコンポーネントのprops（mutableな配列型）に直接渡せないため、
// チャート/一覧コンポーネントへのフォールバック用に型付きの空配列を用意する。
const EMPTY_TREND_POINTS: TrendPoint[] = [];
const EMPTY_BUDGET_VARIANCE_ROWS: BudgetVarianceRow[] = [];
const EMPTY_CATEGORY_PIVOT_ROWS: CategoryPivotRow[] = [];

/** 支出推移・収支推移グラフの粒度に応じた取得範囲。日/週は選択月、月は選択年、年は選択に関わらず全履歴（無料プランはfloorDate以降に制限）。
 * floorDateは無料プランの参照可能期間下限（YYYY-MM-DD、有料プランはundefined=無制限）。 */
function trendRangeFor(
  granularity: TrendGranularity,
  selectedYearMonth: string,
  floorDate?: string,
): { from?: string; to: string } {
  if (granularity === 'year') {
    return { from: floorDate, to: todayJst() };
  }
  if (granularity === 'month') {
    return yearDateRange(selectedYearMonth.slice(0, 4));
  }
  return monthDateRange(selectedYearMonth);
}

export default function DashboardPage() {
  const [expenseGranularity, setExpenseGranularity] = useState<TrendGranularity>('day');
  const [incomeExpenseGranularity, setIncomeExpenseGranularity] =
    useState<TrendGranularity>('month');
  const [selectedYearMonth, setSelectedYearMonth] = useState(currentYearMonthJst());
  const yearMonth = selectedYearMonth;
  const previousMonth = previousYearMonth(yearMonth);
  const currentMonth = currentYearMonthJst();

  // 無料プランは直近3ヶ月のみ参照可能（有料プランやプラン未確定時はundefined=無制限）。
  const profileQuery = useUserProfile();
  const plan = profileQuery.data?.plan;
  const planFloorDate =
    plan === 'free' ? resolvePlanFloorDateString('free', new Date()) : undefined;

  const expenseTrendRange = trendRangeFor(expenseGranularity, selectedYearMonth, planFloorDate);
  const expenseTrendQuery = useQuery({
    queryKey: [
      'aggregation',
      'trend',
      expenseGranularity,
      expenseTrendRange.from ?? null,
      expenseTrendRange.to,
      'excludeFixed',
    ],
    queryFn: async () =>
      getTrend({ granularity: expenseGranularity, ...expenseTrendRange, excludeFixed: true }),
  });

  const incomeExpenseTrendRange = trendRangeFor(
    incomeExpenseGranularity,
    selectedYearMonth,
    planFloorDate,
  );
  const incomeExpenseTrendQuery = useQuery({
    queryKey: [
      'aggregation',
      'trend',
      incomeExpenseGranularity,
      incomeExpenseTrendRange.from ?? null,
      incomeExpenseTrendRange.to,
    ],
    queryFn: async () =>
      getTrend({ granularity: incomeExpenseGranularity, ...incomeExpenseTrendRange }),
  });

  const kpiRangeTo = monthDateRange(yearMonth).to;
  const kpiTrendQuery = useQuery({
    queryKey: ['aggregation', 'trend', 'month', previousMonth, kpiRangeTo],
    queryFn: async () =>
      getTrend({ granularity: 'month', from: `${previousMonth}-01`, to: kpiRangeTo }),
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
    queryKey: ['aggregation', 'trend', 'month', 'all-history', planFloorDate ?? null],
    queryFn: async () => getTrend({ granularity: 'month', from: planFloorDate, to: todayJst() }),
  });

  const isInitialLoading =
    expenseTrendQuery.isPending ||
    incomeExpenseTrendQuery.isPending ||
    kpiTrendQuery.isPending ||
    categoryPivotQuery.isPending ||
    budgetVarianceQuery.isPending ||
    assetFormationQuery.isPending;

  // 無料プランと判明している間、または期間制限をすり抜けて403 PLAN_RESTRICTEDが返ってきた場合に案内カードを出す
  const planRestricted =
    plan === 'free' ||
    [
      expenseTrendQuery,
      incomeExpenseTrendQuery,
      kpiTrendQuery,
      categoryPivotQuery,
      budgetVarianceQuery,
      assetFormationQuery,
    ].some((query) => query.isError && isPlanRestrictedError(query.error));

  const assetFormationData = useMemo(
    () => toCumulativeSeries(assetFormationQuery.data ?? EMPTY_ARRAY),
    [assetFormationQuery.data],
  );

  const currentKpiPoint = kpiTrendQuery.data?.find((point) => point.period === yearMonth);
  const previousKpiPoint = kpiTrendQuery.data?.find((point) => point.period === previousMonth);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <MonthNavigator
          value={selectedYearMonth}
          onChange={setSelectedYearMonth}
          min={planFloorDate?.slice(0, 7)}
          max={currentMonth}
        />
        {selectedYearMonth !== currentMonth && (
          <Button variant="outline" size="sm" onClick={() => setSelectedYearMonth(currentMonth)}>
            今月に戻す
          </Button>
        )}
      </div>

      <SummaryStatTiles
        currentIncome={currentKpiPoint?.income ?? 0}
        currentExpense={currentKpiPoint?.expense ?? 0}
        previousIncome={previousKpiPoint?.income ?? 0}
        previousExpense={previousKpiPoint?.expense ?? 0}
        isLoading={isInitialLoading}
      />

      {planRestricted && <PlanRestrictionNotice />}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <CardTitle>支出推移</CardTitle>
              <InfoTooltip label="支出推移の説明">
                支出の推移（振替・固定費は含みません）
              </InfoTooltip>
            </div>
            <Tabs
              value={expenseGranularity}
              onValueChange={(v) => setExpenseGranularity(v as TrendGranularity)}
            >
              <TabsList>
                {EXPENSE_TREND_GRANULARITIES.map((g) => (
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
            data={expenseTrendQuery.data ?? EMPTY_TREND_POINTS}
            granularity={expenseGranularity}
            isLoading={isInitialLoading}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <CardTitle>収支推移</CardTitle>
              <InfoTooltip label="収支推移の説明">収入・支出の推移（振替は含みません）</InfoTooltip>
            </div>
            <Tabs
              value={incomeExpenseGranularity}
              onValueChange={(v) => setIncomeExpenseGranularity(v as TrendGranularity)}
            >
              <TabsList>
                {INCOME_EXPENSE_TREND_GRANULARITIES.map((g) => (
                  <TabsTrigger key={g} value={g}>
                    {GRANULARITY_LABEL[g]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <IncomeExpenseTrendChart
            data={incomeExpenseTrendQuery.data ?? EMPTY_TREND_POINTS}
            granularity={incomeExpenseGranularity}
            isLoading={isInitialLoading}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-1.5">
              <CardTitle>予実差（費目別）</CardTitle>
              <InfoTooltip label="予実差（費目別）の説明">
                {formatYearMonth(yearMonth)} の予算に対する実績（変動費のみ）
              </InfoTooltip>
            </div>
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
            <div className="flex items-center gap-1.5">
              <CardTitle>費目別支出の内訳</CardTitle>
              <InfoTooltip label="費目別支出の内訳の説明">
                {formatYearMonth(yearMonth)} の支出（費目別・変動費のみ）
              </InfoTooltip>
            </div>
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
            <div className="flex items-center gap-1.5">
              <CardTitle>資産形成推移</CardTitle>
              <InfoTooltip label="資産形成推移の説明">
                積立・投資・保険・NISA拠出などの振替のみを集計（収支には含みません）
              </InfoTooltip>
            </div>
          </CardHeader>
          <CardContent>
            <AssetFormationChart data={assetFormationData} isLoading={isInitialLoading} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
