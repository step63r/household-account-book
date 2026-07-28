import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TrendGranularity } from '@household/shared';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendChart } from '@/components/charts/TrendChart';
import { AssetFormationChart } from '@/components/charts/AssetFormationChart';
import { BudgetVarianceList } from '@/components/charts/BudgetVarianceList';
import { computeAssetFormationTrend, computeBudgetVariance, computeTrend } from '@/lib/aggregate';
import { getCategories } from '@/lib/categories';
import { getBudgets } from '@/lib/budgets';
import { getTransactions } from '@/lib/transactions';
import { EMPTY_ARRAY } from '@/lib/utils';
import { formatYearMonth } from '@/lib/date';

const GRANULARITY_LABEL: Record<TrendGranularity, string> = {
  day: '日次',
  week: '週次',
  month: '月次',
};

/** 日本時間の当月（YYYY-MM）。toISOString()はUTC基準になるため使わない
 * （月初〜朝9時のUTC日付が前月にずれる）。 */
function currentYearMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date()).slice(0, 7);
}

export default function DashboardPage() {
  const [granularity, setGranularity] = useState<TrendGranularity>('day');
  const yearMonth = currentYearMonth();

  const transactionsQuery = useQuery({ queryKey: ['transactions'], queryFn: async () => getTransactions() });
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: async () => getCategories() });
  const budgetsQuery = useQuery({
    queryKey: ['budgets', yearMonth],
    queryFn: async () => getBudgets(yearMonth),
  });

  const transactions = transactionsQuery.data ?? EMPTY_ARRAY;
  const budgets = budgetsQuery.data ?? EMPTY_ARRAY;
  const categories = categoriesQuery.data ?? EMPTY_ARRAY;

  const trendData = useMemo(() => computeTrend(transactions, granularity), [transactions, granularity]);
  const assetFormationData = useMemo(
    () => computeAssetFormationTrend(transactions, granularity),
    [transactions, granularity],
  );
  const varianceRows = useMemo(
    () => computeBudgetVariance(transactions, budgets, categories, yearMonth),
    [transactions, budgets, categories, yearMonth],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">ダッシュボード</h1>
        <p className="text-sm text-muted-foreground">収支の推移と予算の状況を確認できます</p>
      </div>

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
          <TrendChart data={trendData} granularity={granularity} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>予実差（当月・費目別）</CardTitle>
            <CardDescription>{formatYearMonth(yearMonth)} の予算に対する実績</CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetVarianceList rows={varianceRows} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>資産形成推移</CardTitle>
            <CardDescription>積立・投資・保険・NISA拠出などの振替のみを集計（収支には含みません）</CardDescription>
          </CardHeader>
          <CardContent>
            <AssetFormationChart data={assetFormationData} granularity={granularity} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
