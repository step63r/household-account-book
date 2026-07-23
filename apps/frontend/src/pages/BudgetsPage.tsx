import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { upsertBudgetInputSchema } from '@household/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { getCategories } from '@/lib/categories';
import { getBudgets, upsertBudget } from '@/lib/local-store';

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function BudgetsPage() {
  const queryClient = useQueryClient();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());

  // TODO(backend): GET /budgets?yearMonth=... に差し替え（GET /categories は実装済みのため src/lib/categories.ts 経由）
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: async () => getCategories() });
  const budgetsQuery = useQuery({ queryKey: ['budgets'], queryFn: async () => getBudgets() });
  const categories = useMemo(
    () => (categoriesQuery.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [categoriesQuery.data],
  );
  const budgetsForMonth = useMemo(
    () => (budgetsQuery.data ?? []).filter((b) => b.yearMonth === yearMonth),
    [budgetsQuery.data, yearMonth],
  );

  // amount のバリデーションは upsertBudgetInputSchema.shape.amount をそのまま各費目に適用する
  const amountSchema = upsertBudgetInputSchema.shape.amount;
  const formSchema = useMemo(
    () => z.object(Object.fromEntries(categories.map((c) => [c.id, amountSchema]))),
    [categories, amountSchema],
  );

  const form = useForm<Record<string, number>>({
    resolver: zodResolver(formSchema),
    values: Object.fromEntries(
      categories.map((c) => [c.id, budgetsForMonth.find((b) => b.categoryId === c.id)?.amount ?? 0]),
    ),
  });

  const saveMutation = useMutation({
    // TODO(backend): PUT /budgets (upsert) に差し替え
    mutationFn: async (values: Record<string, number>) => {
      for (const category of categories) {
        const amount = values[category.id] ?? 0;
        upsertBudget({ yearMonth, categoryId: category.id, amount });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });

  const onSubmit = form.handleSubmit((values) => saveMutation.mutate(values));

  const fixedCategories = categories.filter((c) => c.type === 'fixed');
  const variableCategories = categories.filter((c) => c.type === 'variable');

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
          <Input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="w-48"
          />
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <BudgetCategoryGroup title="固定費" categories={fixedCategories} control={form.control} />
          <BudgetCategoryGroup title="変動費" categories={variableCategories} control={form.control} />

          <div className="flex justify-end">
            <Button type="submit" disabled={saveMutation.isPending || categories.length === 0}>
              予算を保存
            </Button>
          </div>
        </form>
      </Form>
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
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
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
