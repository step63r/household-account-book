import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { upsertBudgetInputSchema } from '@household/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getCategories } from '@/lib/categories';
import { getBudgets, upsertBudget } from '@/lib/budgets';
import { EMPTY_ARRAY } from '@/lib/utils';
import { formatYearMonth } from '@/lib/date';
import { formatYen } from '@/lib/format';

/** 日本時間の当月（YYYY-MM）。toISOString()はUTC基準になるため使わない
 * （月初〜朝9時のUTC日付が前月にずれる）。 */
function currentYearMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' })
    .format(new Date())
    .slice(0, 7);
}

function previousYearMonth(yearMonth: string): string {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function BudgetsPage() {
  const queryClient = useQueryClient();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => getCategories(),
  });
  const budgetsQuery = useQuery({
    queryKey: ['budgets', yearMonth],
    queryFn: async () => getBudgets(yearMonth),
  });
  const categories = useMemo(
    () => (categoriesQuery.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [categoriesQuery.data],
  );
  const budgetsForMonth = budgetsQuery.data ?? EMPTY_ARRAY;

  // amount のバリデーションは upsertBudgetInputSchema.shape.amount をそのまま各費目に適用する
  const amountSchema = upsertBudgetInputSchema.shape.amount;
  const formSchema = useMemo(
    () => z.object(Object.fromEntries(categories.map((c) => [c.id, amountSchema]))),
    [categories, amountSchema],
  );

  const form = useForm<Record<string, number>>({
    resolver: zodResolver(formSchema),
    values: Object.fromEntries(
      categories.map((c) => [
        c.id,
        budgetsForMonth.find((b) => b.categoryId === c.id)?.amount ?? 0,
      ]),
    ),
  });

  const saveMutation = useMutation({
    mutationFn: async (values: Record<string, number>) => {
      await Promise.all(
        categories.map((category) =>
          upsertBudget({ yearMonth, categoryId: category.id, amount: values[category.id] ?? 0 }),
        ),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });

  const onSubmit = form.handleSubmit((values) => saveMutation.mutate(values));

  const copyMutation = useMutation({
    mutationFn: async () => {
      const prevBudgets = await getBudgets(previousYearMonth(yearMonth));
      await Promise.all(
        categories.map((category) => {
          const amount = prevBudgets.find((b) => b.categoryId === category.id)?.amount ?? 0;
          return upsertBudget({ yearMonth, categoryId: category.id, amount });
        }),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
      setCopyDialogOpen(false);
    },
  });

  const fixedCategories = categories.filter((c) => c.type === 'fixed');
  const variableCategories = categories.filter((c) => c.type === 'variable');

  // 保存前の入力値（未保存分も含む）から各合計を算出する
  const watchedAmounts = useWatch({ control: form.control });
  const sumAmounts = (categoryList: { id: string }[]) =>
    categoryList.reduce((sum, c) => sum + (Number(watchedAmounts?.[c.id]) || 0), 0);
  const totalAmount = sumAmounts(categories);
  const fixedTotalAmount = sumAmounts(fixedCategories);
  const variableTotalAmount = sumAmounts(variableCategories);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">予算</h1>
        <p className="text-sm text-muted-foreground">月・費目ごとに予算を設定します</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>対象月</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="w-48"
            />
            <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    categories.length === 0 || saveMutation.isPending || copyMutation.isPending
                  }
                >
                  前月をコピー
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>前月の予算をコピーしますか？</DialogTitle>
                  <DialogDescription>
                    {formatYearMonth(previousYearMonth(yearMonth))} の予算を{' '}
                    {formatYearMonth(yearMonth)} にコピーして保存します。 現在保存されている{' '}
                    {formatYearMonth(yearMonth)}{' '}
                    の予算（未保存の変更があれば破棄されます）は上書きされます。
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCopyDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button
                    type="button"
                    onClick={() => copyMutation.mutate()}
                    disabled={copyMutation.isPending}
                    loading={copyMutation.isPending}
                  >
                    コピーする
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <BudgetTotalRow label="予算の合計" amount={totalAmount} />

      <Form {...form}>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <BudgetCategoryGroup title="固定費" categories={fixedCategories} control={form.control} />

          <BudgetTotalRow label="固定費の合計" amount={fixedTotalAmount} />

          <BudgetCategoryGroup
            title="変動費"
            categories={variableCategories}
            control={form.control}
          />

          <BudgetTotalRow label="変動費の合計" amount={variableTotalAmount} />

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saveMutation.isPending || categories.length === 0}
              loading={saveMutation.isPending}
            >
              予算を保存
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function BudgetTotalRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{formatYen(amount)}</span>
    </div>
  );
}

function BudgetCategoryGroup({
  title,
  categories,
  control,
}: {
  title: string;
  categories: { id: string; name: string }[];
  control: ReturnType<typeof useForm<Record<string, number>>>['control'];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{categories.length} 件</CardDescription>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">費目がありません</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <FormField
                key={c.id}
                control={control}
                name={c.id}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{c.name}</FormLabel>
                    <FormControl>
                      <AmountInput
                        name={field.name}
                        ref={field.ref}
                        value={field.value ?? 0}
                        onChange={field.onChange}
                        onBlur={() => {
                          if (Number.isNaN(field.value)) {
                            field.onChange(0);
                          }
                          field.onBlur();
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
