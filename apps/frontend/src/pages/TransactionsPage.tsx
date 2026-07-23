import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import {
  createTransactionInputSchema,
  type CreateTransactionInput,
  type TransactionType,
} from '@household/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getCategories } from '@/lib/categories';
import { createTransaction, deleteTransaction, getTransactions } from '@/lib/local-store';
import { EMPTY_ARRAY } from '@/lib/utils';

const TYPE_LABEL: Record<TransactionType, string> = {
  income: '収入',
  expense: '支出',
  transfer: '振替',
};

const TYPE_BADGE_VARIANT: Record<TransactionType, 'default' | 'secondary' | 'outline'> = {
  income: 'default',
  expense: 'secondary',
  transfer: 'outline',
};

const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TransactionsPage() {
  const queryClient = useQueryClient();

  // TODO(backend): GET /transactions に差し替え（GET /categories は実装済みのため src/lib/categories.ts 経由）
  const transactionsQuery = useQuery({ queryKey: ['transactions'], queryFn: async () => getTransactions() });
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: async () => getCategories() });
  const transactions = transactionsQuery.data ?? EMPTY_ARRAY;
  const categories = categoriesQuery.data ?? EMPTY_ARRAY;
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const createMutation = useMutation({
    // TODO(backend): POST /transactions に差し替え
    mutationFn: async (input: CreateTransactionInput) => createTransaction(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      form.reset({ ...form.getValues(), amount: 0, memo: '' });
    },
  });

  const deleteMutation = useMutation({
    // TODO(backend): DELETE /transactions/:id に差し替え
    mutationFn: async (id: string) => deleteTransaction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const form = useForm<CreateTransactionInput>({
    resolver: zodResolver(createTransactionInputSchema),
    defaultValues: {
      date: today(),
      type: 'expense',
      categoryId: null,
      amount: 0,
      memo: '',
      transferLabel: '',
    },
  });

  const [typeValue, setTypeValue] = useState<TransactionType>('expense');

  const onSubmit = form.handleSubmit((values) => {
    createMutation.mutate({
      ...values,
      categoryId: values.type === 'transfer' ? null : values.categoryId,
      memo: values.memo || undefined,
      transferLabel: values.type === 'transfer' ? values.transferLabel || undefined : undefined,
    });
  });

  const sortedTransactions = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">取引</h1>
        <p className="text-sm text-muted-foreground">収入・支出・振替を記録します</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>取引を追加</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>日付</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>種別</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        setTypeValue(v as TransactionType);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="income">収入</SelectItem>
                        <SelectItem value="expense">支出</SelectItem>
                        <SelectItem value="transfer">振替（積立・投資など）</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {typeValue === 'transfer' ? (
                <FormField
                  control={form.control}
                  name="transferLabel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>積立先</FormLabel>
                      <FormControl>
                        <Input placeholder="例: つみたてNISA" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>費目</FormLabel>
                      <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="費目を選択" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>金額（円）</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="memo"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2 lg:col-span-3">
                    <FormLabel>摘要</FormLabel>
                    <FormControl>
                      <Textarea rows={1} placeholder="任意" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-end">
                <Button type="submit" disabled={createMutation.isPending} className="w-full">
                  追加する
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>取引一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedTransactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">取引がまだありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-normal">日付</th>
                    <th className="py-2 pr-3 font-normal">種別</th>
                    <th className="py-2 pr-3 font-normal">費目</th>
                    <th className="py-2 pr-3 text-right font-normal">金額</th>
                    <th className="py-2 pr-3 font-normal">摘要</th>
                    <th className="py-2 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {sortedTransactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{tx.date}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={TYPE_BADGE_VARIANT[tx.type]}>{TYPE_LABEL[tx.type]}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {tx.type === 'transfer'
                          ? (tx.transferLabel ?? '-')
                          : (tx.categoryId && categoryById.get(tx.categoryId)?.name) || '未分類'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums font-medium">
                        {yenFormatter.format(tx.amount)}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{tx.memo ?? ''}</td>
                      <td className="py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="削除"
                          onClick={() => deleteMutation.mutate(tx.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
