import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import {
  createTransactionInputSchema,
  INCOME_SOURCE_PRESETS,
  type CreateTransactionInput,
  type Transaction,
  type TransactionType,
} from '@household/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
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
import {
  createTransaction,
  deleteTransaction,
  getTransactions,
  updateTransaction,
} from '@/lib/transactions';
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

/** 日本時間の本日日付（YYYY-MM-DD）。toISOString()はUTC基準になるため使わない
 * （深夜0〜9時のUTC日付が前日にずれる）。 */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

/** 収入源Selectで「その他（自由入力）」を表す番兵値。incomeSourceの値としては保存しない。 */
const CUSTOM_INCOME_SOURCE = '__custom__';

function isCustomIncomeSource(incomeSource: string): boolean {
  return incomeSource !== '' && !(INCOME_SOURCE_PRESETS as readonly string[]).includes(incomeSource);
}

export default function TransactionsPage() {
  const queryClient = useQueryClient();

  const transactionsQuery = useQuery({ queryKey: ['transactions'], queryFn: async () => getTransactions() });
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: async () => getCategories() });
  const transactions = transactionsQuery.data ?? EMPTY_ARRAY;
  const categories = categoriesQuery.data ?? EMPTY_ARRAY;
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const [editingId, setEditingId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (input: CreateTransactionInput) => createTransaction(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      form.reset({ ...form.getValues(), amount: NaN, memo: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CreateTransactionInput }) =>
      updateTransaction(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setEditingId(null);
      form.reset({
        date: today(),
        type: 'expense',
        categoryId: null,
        amount: NaN,
        memo: '',
        transferLabel: '',
        incomeSource: '',
      });
      setTypeValue('expense');
      setCustomIncomeSource(false);
    },
  });

  const deleteMutation = useMutation({
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
      amount: NaN,
      memo: '',
      transferLabel: '',
      incomeSource: '',
    },
  });

  const [typeValue, setTypeValue] = useState<TransactionType>('expense');
  const [customIncomeSource, setCustomIncomeSource] = useState(false);

  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setTypeValue(tx.type);
    setCustomIncomeSource(isCustomIncomeSource(tx.incomeSource ?? ''));
    form.reset({
      date: tx.date,
      type: tx.type,
      categoryId: tx.categoryId,
      amount: tx.amount,
      memo: tx.memo ?? '',
      transferLabel: tx.transferLabel ?? '',
      incomeSource: tx.incomeSource ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    form.reset({
      date: today(),
      type: 'expense',
      categoryId: null,
      amount: NaN,
      memo: '',
      transferLabel: '',
      incomeSource: '',
    });
    setTypeValue('expense');
    setCustomIncomeSource(false);
  };

  const onSubmit = form.handleSubmit((values) => {
    const input: CreateTransactionInput = {
      ...values,
      categoryId: values.type === 'expense' ? values.categoryId : null,
      memo: values.memo || undefined,
      transferLabel: values.type === 'transfer' ? values.transferLabel || undefined : undefined,
      incomeSource: values.type === 'income' ? values.incomeSource || undefined : undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, input });
    } else {
      createMutation.mutate(input);
    }
  });

  const sortedTransactions = [...transactions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">取引</h1>
        <p className="text-sm text-muted-foreground">収入・支出・振替を記録します</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? '取引を編集' : '取引を追加'}</CardTitle>
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
              ) : typeValue === 'income' ? (
                <FormField
                  control={form.control}
                  name="incomeSource"
                  render={({ field }) => {
                    const selectValue = customIncomeSource ? CUSTOM_INCOME_SOURCE : field.value || undefined;
                    return (
                      <FormItem>
                        <FormLabel>収入源</FormLabel>
                        <Select
                          value={selectValue}
                          onValueChange={(v) => {
                            if (v === CUSTOM_INCOME_SOURCE) {
                              setCustomIncomeSource(true);
                              field.onChange('');
                            } else {
                              setCustomIncomeSource(false);
                              field.onChange(v);
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="収入源を選択" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {INCOME_SOURCE_PRESETS.map((preset) => (
                              <SelectItem key={preset} value={preset}>
                                {preset}
                              </SelectItem>
                            ))}
                            <SelectItem value={CUSTOM_INCOME_SOURCE}>その他（自由入力）</SelectItem>
                          </SelectContent>
                        </Select>
                        {customIncomeSource ? (
                          <FormControl>
                            <Input placeholder="収入源を入力" {...field} value={field.value ?? ''} className="mt-2" />
                          </FormControl>
                        ) : null}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
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
                      <AmountInput {...field} />
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

              <div className="flex items-end gap-2">
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="w-full"
                >
                  {editingId ? '更新する' : '追加する'}
                </Button>
                {editingId ? (
                  <Button type="button" variant="outline" onClick={cancelEdit}>
                    キャンセル
                  </Button>
                ) : null}
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
                          : tx.type === 'income'
                            ? (tx.incomeSource ?? '未分類')
                            : (tx.categoryId && categoryById.get(tx.categoryId)?.name) || '未分類'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums font-medium">
                        {yenFormatter.format(tx.amount)}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{tx.memo ?? ''}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="編集"
                          onClick={() => startEdit(tx)}
                        >
                          <Pencil className="size-4" />
                        </Button>
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
