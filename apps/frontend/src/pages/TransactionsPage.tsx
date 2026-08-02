import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createTransactionInputSchema,
  INCOME_SOURCE_PRESETS,
  type Category,
  type CreateTransactionInput,
  type Transaction,
  type TransactionType,
} from '@household/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/ui/amount-input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import { getCategories } from '@/lib/categories';
import {
  createTransaction,
  deleteTransaction,
  getTransactions,
  updateTransaction,
} from '@/lib/transactions';
import { getMemoSuggestions } from '@/lib/aggregation';
import { EMPTY_ARRAY } from '@/lib/utils';
import { addMonthsToDate, formatDate, todayJst } from '@/lib/date';

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

/** 日本時間の当月（YYYY-MM）。toISOString()はUTC基準になるため使わない
 * （月初〜朝9時のUTC日付が前月にずれる）。 */
function currentYearMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date()).slice(0, 7);
}

/** 選択月（YYYY-MM）の初日・末日（YYYY-MM-DD）を返す。取引一覧の絞り込みに使う。 */
function monthDateRange(yearMonth: string): { from: string; to: string } {
  const [yearStr, monthStr] = yearMonth.split('-');
  const lastDay = new Date(Number(yearStr), Number(monthStr), 0).getDate();
  return { from: `${yearMonth}-01`, to: `${yearMonth}-${String(lastDay).padStart(2, '0')}` };
}

/** 収入源Selectで「その他（自由入力）」を表す番兵値。incomeSourceの値としては保存しない。 */
const CUSTOM_INCOME_SOURCE = '__custom__';

function isCustomIncomeSource(incomeSource: string): boolean {
  return incomeSource !== '' && !(INCOME_SOURCE_PRESETS as readonly string[]).includes(incomeSource);
}

function defaultFormValues(transaction: Transaction | null): CreateTransactionInput {
  if (!transaction) {
    return {
      date: today(),
      type: 'expense',
      categoryId: null,
      amount: NaN,
      memo: '',
      transferLabel: '',
      incomeSource: '',
    };
  }
  return {
    date: transaction.date,
    type: transaction.type,
    categoryId: transaction.categoryId,
    amount: transaction.amount,
    memo: transaction.memo ?? '',
    transferLabel: transaction.transferLabel ?? '',
    incomeSource: transaction.incomeSource ?? '',
  };
}

function buildTransactionInput(values: CreateTransactionInput): CreateTransactionInput {
  return {
    ...values,
    categoryId: values.type === 'expense' ? values.categoryId : null,
    memo: values.memo || undefined,
    transferLabel: values.type === 'transfer' ? values.transferLabel || undefined : undefined,
    incomeSource: values.type === 'income' ? values.incomeSource || undefined : undefined,
  };
}

/** 種別フィルタの選択肢（順序固定）。 */
const TYPE_FILTER_OPTIONS: TransactionType[] = ['income', 'expense', 'transfer'];

/** 取引一覧の範囲指定で許容する最大期間（月数）。 */
const MAX_DATE_RANGE_MONTHS = 3;

export default function TransactionsPage() {
  const queryClient = useQueryClient();

  const defaultRange = monthDateRange(currentYearMonth());
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [selectedTypes, setSelectedTypes] = useState<TransactionType[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [amountMin, setAmountMin] = useState(NaN);
  const [amountMax, setAmountMax] = useState(NaN);
  const [memoQuery, setMemoQuery] = useState('');

  const transactionsQuery = useQuery({
    queryKey: ['transactions', dateFrom, dateTo],
    queryFn: async () => getTransactions({ from: dateFrom || undefined, to: dateTo || undefined }),
  });
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: async () => getCategories() });
  const transactions = transactionsQuery.data ?? EMPTY_ARRAY;
  const categories = categoriesQuery.data ?? EMPTY_ARRAY;
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  /** 費目フィルタの選択肢。費目マスタ全件ではなく、今フェッチしている取引に実際に登場する費目のみ */
  const displayedCategoryOptions = useMemo(() => {
    const ids = new Set(
      transactions.filter((tx) => tx.type === 'expense' && tx.categoryId).map((tx) => tx.categoryId as string),
    );
    return categories
      .filter((c) => ids.has(c.id))
      .map((c) => ({ value: c.id, label: c.name }));
  }, [transactions, categories]);

  /** FROMを変更。TOがFROMより前になる場合はTOをFROMに合わせ、範囲が最大期間を超える場合はTOを詰める。 */
  function handleDateFromChange(value: string) {
    setDateFrom(value);
    if (!value) return;
    if (dateTo && dateTo < value) {
      setDateTo(value);
      return;
    }
    const maxTo = addMonthsToDate(value, MAX_DATE_RANGE_MONTHS);
    if (dateTo && dateTo > maxTo) {
      setDateTo(maxTo);
    }
  }

  /** TOを変更。FROMがTOより後になる場合はFROMをTOに合わせ、範囲が最大期間を超える場合はFROMを詰める。 */
  function handleDateToChange(value: string) {
    setDateTo(value);
    if (!value) return;
    if (dateFrom && dateFrom > value) {
      setDateFrom(value);
      return;
    }
    const minFrom = addMonthsToDate(value, -MAX_DATE_RANGE_MONTHS);
    if (dateFrom && dateFrom < minFrom) {
      setDateFrom(minFrom);
    }
  }

  function clearFilters() {
    setDateFrom(defaultRange.from);
    setDateTo(defaultRange.to);
    setSelectedTypes([]);
    setSelectedCategoryIds([]);
    setAmountMin(NaN);
    setAmountMax(NaN);
    setMemoQuery('');
  }

  const [dialogState, setDialogState] = useState<{ open: boolean; transaction: Transaction | null }>({
    open: false,
    transaction: null,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateTransactionInput) => createTransaction(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CreateTransactionInput }) =>
      updateTransaction(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteTransaction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  function openCreateDialog() {
    setDialogState({ open: true, transaction: null });
  }

  function openEditDialog(transaction: Transaction) {
    setDialogState({ open: true, transaction });
  }

  const filteredTransactions = useMemo(() => {
    const trimmedMemoQuery = memoQuery.trim();
    return transactions.filter((tx) => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(tx.type)) return false;
      if (
        selectedCategoryIds.length > 0 &&
        (!tx.categoryId || !selectedCategoryIds.includes(tx.categoryId))
      ) {
        return false;
      }
      if (!Number.isNaN(amountMin) && tx.amount < amountMin) return false;
      if (!Number.isNaN(amountMax) && tx.amount > amountMax) return false;
      if (trimmedMemoQuery !== '' && !(tx.memo ?? '').includes(trimmedMemoQuery)) return false;
      return true;
    });
  }, [transactions, selectedTypes, selectedCategoryIds, amountMin, amountMax, memoQuery]);

  const sortedTransactions = [...filteredTransactions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">取引</h1>
          <p className="text-sm text-muted-foreground">収入・支出・振替を記録します</p>
        </div>
        <Dialog
          open={dialogState.open}
          onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))}
        >
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="size-4" />
              取引を追加
            </Button>
          </DialogTrigger>
          <TransactionFormDialog
            key={dialogState.transaction?.id ?? 'new'}
            transaction={dialogState.transaction}
            categories={categories}
            createMutation={createMutation}
            updateMutation={updateMutation}
            onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>取引一覧</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => handleDateFromChange(e.target.value)}
                min={dateTo ? addMonthsToDate(dateTo, -MAX_DATE_RANGE_MONTHS) : undefined}
                max={dateTo || undefined}
                className="w-36"
              />
              <span className="text-muted-foreground text-sm">〜</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => handleDateToChange(e.target.value)}
                min={dateFrom || undefined}
                max={dateFrom ? addMonthsToDate(dateFrom, MAX_DATE_RANGE_MONTHS) : undefined}
                className="w-36"
              />
            </div>

            <MultiSelectFilter
              label="種別"
              options={TYPE_FILTER_OPTIONS.map((type) => ({ value: type, label: TYPE_LABEL[type] }))}
              selected={selectedTypes}
              onChange={(values) => setSelectedTypes(values as TransactionType[])}
            />

            <MultiSelectFilter
              label="費目"
              options={displayedCategoryOptions}
              selected={selectedCategoryIds}
              onChange={setSelectedCategoryIds}
            />

            <div className="flex items-center gap-2">
              <AmountInput value={amountMin} onChange={setAmountMin} placeholder="下限" className="w-24" />
              <span className="text-muted-foreground text-sm">円〜</span>
              <AmountInput value={amountMax} onChange={setAmountMax} placeholder="上限" className="w-24" />
              <span className="text-muted-foreground text-sm">円</span>
            </div>

            <Input
              type="text"
              value={memoQuery}
              onChange={(e) => setMemoQuery(e.target.value)}
              placeholder="摘要で検索"
              className="w-40"
            />

            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              フィルタを解除
            </Button>
          </div>

          {transactionsQuery.isPending ? (
            <TransactionsTableSkeleton />
          ) : sortedTransactions.length === 0 ? (
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
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{formatDate(tx.date)}</td>
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
                          onClick={() => openEditDialog(tx)}
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

function TransactionsTableSkeleton() {
  return (
    <div className="overflow-x-auto" aria-label="取引一覧を読み込み中" aria-busy="true">
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
          {Array.from({ length: 8 }, (_, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="py-2 pr-3">
                <Skeleton className="h-4 w-20" />
              </td>
              <td className="py-2 pr-3">
                <Skeleton className="h-5 w-12 rounded-full" />
              </td>
              <td className="py-2 pr-3">
                <Skeleton className="h-4 w-24" />
              </td>
              <td className="py-2 pr-3">
                <Skeleton className="ml-auto h-4 w-16" />
              </td>
              <td className="py-2 pr-3">
                <Skeleton className="h-4 w-32" />
              </td>
              <td className="py-2 text-right">
                <Skeleton className="ml-auto h-8 w-16" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionFormDialog({
  transaction,
  categories,
  createMutation,
  updateMutation,
  onOpenChange,
}: {
  transaction: Transaction | null;
  categories: readonly Category[];
  createMutation: UseMutationResult<Transaction, Error, CreateTransactionInput>;
  updateMutation: UseMutationResult<Transaction, Error, { id: string; input: CreateTransactionInput }>;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useForm<CreateTransactionInput>({
    resolver: zodResolver(createTransactionInputSchema),
    defaultValues: defaultFormValues(transaction),
  });

  const [typeValue, setTypeValue] = useState<TransactionType>(transaction?.type ?? 'expense');
  const [customIncomeSource, setCustomIncomeSource] = useState(
    isCustomIncomeSource(transaction?.incomeSource ?? ''),
  );

  const [pendingAction, setPendingAction] = useState<'submit' | 'continuous' | null>(null);

  const memoSuggestionsQuery = useQuery({
    queryKey: ['memo-suggestions'],
    queryFn: () => getMemoSuggestions({ from: addMonthsToDate(todayJst(), -3), to: todayJst() }),
    staleTime: 5 * 60 * 1000,
  });

  const handleSubmit = form.handleSubmit((values) => {
    const input = buildTransactionInput(values);
    setPendingAction('submit');
    if (transaction) {
      updateMutation.mutate({ id: transaction.id, input }, { onSuccess: () => onOpenChange(false) });
    } else {
      createMutation.mutate(input, { onSuccess: () => onOpenChange(false) });
    }
  });

  const handleContinuousSubmit = form.handleSubmit((values) => {
    const input = buildTransactionInput(values);
    setPendingAction('continuous');
    createMutation.mutate(input, {
      onSuccess: () => {
        form.reset({ ...form.getValues(), amount: NaN, memo: '' });
      },
    });
  });

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{transaction ? '取引を編集' : '取引を追加'}</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              <FormItem>
                <FormLabel>摘要</FormLabel>
                <FormControl>
                  <Input list="memo-suggestions" placeholder="任意" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <datalist id="memo-suggestions">
            {(memoSuggestionsQuery.data ?? EMPTY_ARRAY).map((memo) => (
              <option key={memo} value={memo} />
            ))}
          </datalist>

          <DialogFooter>
            {transaction ? null : (
              <Button
                type="button"
                variant="outline"
                onClick={handleContinuousSubmit}
                disabled={pending}
                loading={pending && pendingAction === 'continuous'}
              >
                連続登録する
              </Button>
            )}
            <Button type="submit" disabled={pending} loading={pending && pendingAction === 'submit'}>
              {transaction ? '更新する' : '登録する'}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}
