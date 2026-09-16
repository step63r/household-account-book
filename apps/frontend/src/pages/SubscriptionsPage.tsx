import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createSubscriptionInputSchema,
  type Category,
  type CreateSubscriptionInput,
  type Subscription,
} from '@household/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AmountInput } from '@/components/ui/amount-input';
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getCategories } from '@/lib/categories';
import {
  createSubscription,
  deleteSubscription,
  getSubscriptions,
  reorderSubscriptions,
  updateSubscription,
} from '@/lib/subscriptions';
import { EMPTY_ARRAY } from '@/lib/utils';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

function billingScheduleLabel(sub: Subscription): string {
  if (sub.frequency === 'yearly') {
    return `毎年${sub.billingMonth ?? '-'}月${sub.billingDay}日`;
  }
  return `毎月${sub.billingDay}日`;
}

export default function SubscriptionsPage() {
  const queryClient = useQueryClient();
  const subscriptionsQuery = useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => getSubscriptions(),
  });
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => getCategories(),
  });
  const subscriptions = subscriptionsQuery.data ?? EMPTY_ARRAY;
  const categories = categoriesQuery.data ?? EMPTY_ARRAY;
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const [dialogState, setDialogState] = useState<{
    open: boolean;
    subscription: Subscription | null;
  }>({
    open: false,
    subscription: null,
  });

  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null);

  const upsertMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: CreateSubscriptionInput }) =>
      id ? updateSubscription(id, input) : createSubscription(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      setDialogState({ open: false, subscription: null });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteSubscription(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      setDeleteTarget(null);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => reorderSubscriptions(orderedIds),
    onMutate: async (orderedIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: ['subscriptions'] });
      const previous = queryClient.getQueryData<Subscription[]>(['subscriptions']);
      queryClient.setQueryData<Subscription[]>(['subscriptions'], (old) => {
        if (!old) return old;
        const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
        return old.map((s) => ({ ...s, sortOrder: orderMap.get(s.id) ?? s.sortOrder }));
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['subscriptions'], context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });

  function openCreateDialog() {
    setDialogState({ open: true, subscription: null });
  }

  function openEditDialog(subscription: Subscription) {
    setDialogState({ open: true, subscription });
  }

  return (
    <div className="flex flex-col gap-6">
      <Dialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))}
      >
        <DialogTrigger asChild>
          <Button
            onClick={openCreateDialog}
            size="icon"
            aria-label="サブスクリプションを追加"
            className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 size-14 rounded-full shadow-lg md:right-8 md:bottom-8"
          >
            <Plus className="size-6" />
          </Button>
        </DialogTrigger>
        <SubscriptionFormDialog
          key={dialogState.subscription?.id ?? 'new'}
          open={dialogState.open}
          subscription={dialogState.subscription}
          categories={categories}
          pending={upsertMutation.isPending}
          onSubmit={(input) =>
            upsertMutation.mutate({ id: dialogState.subscription?.id ?? null, input })
          }
        />
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>サブスクリプション</CardTitle>
          <CardDescription>{subscriptions.length} 件</CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              サブスクリプションが登録されていません
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => {
                const { active, over } = event;
                if (!over || active.id === over.id) return;
                const oldIndex = subscriptions.findIndex((s) => s.id === active.id);
                const newIndex = subscriptions.findIndex((s) => s.id === over.id);
                reorderMutation.mutate(
                  arrayMove([...subscriptions], oldIndex, newIndex).map((s) => s.id),
                );
              }}
            >
              <SortableContext
                items={subscriptions.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col divide-y divide-border">
                  {subscriptions.map((sub) => (
                    <SortableSubscriptionRow
                      key={sub.id}
                      subscription={sub}
                      categoryName={categoryById.get(sub.categoryId)?.name ?? '未分類'}
                      onEdit={openEditDialog}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`「${deleteTarget?.name ?? ''}」を削除しますか？`}
        description="この操作は取り消せません。"
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

function SortableSubscriptionRow({
  subscription,
  categoryName,
  onEdit,
  onDelete,
}: {
  subscription: Subscription;
  categoryName: string;
  onEdit: (subscription: Subscription) => void;
  onDelete: (subscription: Subscription) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subscription.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center justify-between gap-2 py-2.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          aria-label="ドラッグして並び替え"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div
          className={
            subscription.isActive
              ? 'flex flex-col gap-0.5'
              : 'flex flex-col gap-0.5 text-muted-foreground'
          }
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{subscription.name}</span>
            {!subscription.isActive && <Badge variant="secondary">無効</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">
            {categoryName} ・ {yenFormatter.format(subscription.amount)} ・{' '}
            {billingScheduleLabel(subscription)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="編集"
          onClick={() => onEdit(subscription)}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="削除"
          onClick={() => onDelete(subscription)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

function defaultFormValues(subscription: Subscription | null): CreateSubscriptionInput {
  if (!subscription) {
    return {
      name: '',
      categoryId: '',
      amount: NaN,
      frequency: 'monthly',
      billingMonth: null,
      billingDay: 1,
      isActive: true,
    };
  }
  return {
    name: subscription.name,
    categoryId: subscription.categoryId,
    amount: subscription.amount,
    frequency: subscription.frequency,
    billingMonth: subscription.billingMonth,
    billingDay: subscription.billingDay,
    isActive: subscription.isActive,
  };
}

function SubscriptionFormDialog({
  open,
  subscription,
  categories,
  pending,
  onSubmit,
}: {
  open: boolean;
  subscription: Subscription | null;
  categories: readonly Category[];
  pending: boolean;
  onSubmit: (input: CreateSubscriptionInput) => void;
}) {
  const form = useForm<CreateSubscriptionInput>({
    resolver: zodResolver(createSubscriptionInputSchema),
    defaultValues: defaultFormValues(subscription),
  });

  // 登録・キャンセルのいずれで閉じても、ダイアログはkey固定（'new'）のため
  // コンポーネント自体は再マウントされない。開くたびに明示的にリセットして
  // 前回入力した値が残らないようにする。
  useEffect(() => {
    if (open) {
      form.reset(defaultFormValues(subscription));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const frequencyValue = useWatch({ control: form.control, name: 'frequency' });

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit({
      ...values,
      billingMonth: values.frequency === 'yearly' ? values.billingMonth : null,
    });
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {subscription ? 'サブスクリプションを編集' : 'サブスクリプションを追加'}
        </DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>名前</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>費目</FormLabel>
                <Select value={field.value || undefined} onValueChange={field.onChange}>
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
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>頻度</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    if (v === 'monthly') {
                      form.setValue('billingMonth', null);
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="monthly">月次</SelectItem>
                    <SelectItem value="yearly">年次</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {frequencyValue === 'yearly' && (
            <FormField
              control={form.control}
              name="billingMonth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>請求月</FormLabel>
                  <Select
                    value={field.value ? String(field.value) : undefined}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="請求月を選択" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MONTH_OPTIONS.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m}月
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
            name="billingDay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>請求日</FormLabel>
                <Select
                  value={field.value ? String(field.value) : undefined}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="請求日を選択" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DAY_OPTIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d}日
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  </FormControl>
                  <Label className="font-normal">有効にする</Label>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="submit" disabled={pending} loading={pending}>
              保存する
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </DialogContent>
  );
}
