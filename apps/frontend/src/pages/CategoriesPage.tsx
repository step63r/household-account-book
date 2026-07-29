import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createCategoryInputSchema,
  type Category,
  type CreateCategoryInput,
} from '@household/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { createCategory, deleteCategory, getCategories, updateCategory } from '@/lib/categories';
import { EMPTY_ARRAY } from '@/lib/utils';

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ['categories'], queryFn: async () => getCategories() });
  const categories = categoriesQuery.data ?? EMPTY_ARRAY;

  const grouped = useMemo(() => {
    const fixed = categories.filter((c) => c.type === 'fixed').sort((a, b) => a.sortOrder - b.sortOrder);
    const variable = categories
      .filter((c) => c.type === 'variable')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return { fixed, variable };
  }, [categories]);

  const [dialogState, setDialogState] = useState<{ open: boolean; category: Category | null }>({
    open: false,
    category: null,
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string | null; input: CreateCategoryInput }) =>
      id ? updateCategory(id, input) : createCategory(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      setDialogState({ open: false, category: null });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteCategory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });

  function openCreateDialog() {
    setDialogState({ open: true, category: null });
  }

  function openEditDialog(category: Category) {
    setDialogState({ open: true, category });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">費目</h1>
          <p className="text-sm text-muted-foreground">固定費・変動費ごとに費目を管理します</p>
        </div>
        <Dialog
          open={dialogState.open}
          onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))}
        >
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="size-4" />
              費目を追加
            </Button>
          </DialogTrigger>
          <CategoryFormDialog
            key={dialogState.category?.id ?? 'new'}
            category={dialogState.category}
            pending={upsertMutation.isPending}
            onSubmit={(input) =>
              upsertMutation.mutate({ id: dialogState.category?.id ?? null, input })
            }
          />
        </Dialog>
      </div>

      <CategoryGroupCard
        title="固定費"
        categories={grouped.fixed}
        onEdit={openEditDialog}
        onDelete={(id) => deleteMutation.mutate(id)}
      />
      <CategoryGroupCard
        title="変動費"
        categories={grouped.variable}
        onEdit={openEditDialog}
        onDelete={(id) => deleteMutation.mutate(id)}
      />
    </div>
  );
}

function CategoryGroupCard({
  title,
  categories,
  onEdit,
  onDelete,
}: {
  title: string;
  categories: Category[];
  onEdit: (category: Category) => void;
  onDelete: (id: string) => void;
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
          <ul className="flex flex-col divide-y divide-border">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{c.name}</span>
                  {c.tooltip && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`${c.name}の説明`}
                        >
                          <Info className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{c.tooltip}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label="編集" onClick={() => onEdit(c)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="削除"
                    onClick={() => onDelete(c.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryFormDialog({
  category,
  pending,
  onSubmit,
}: {
  category: Category | null;
  pending: boolean;
  onSubmit: (input: CreateCategoryInput) => void;
}) {
  const form = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategoryInputSchema),
    defaultValues: {
      name: category?.name ?? '',
      type: category?.type ?? 'variable',
      tooltip: category?.tooltip ?? '',
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit({ ...values, tooltip: values.tooltip || undefined });
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{category ? '費目を編集' : '費目を追加'}</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>費目名</FormLabel>
                <FormControl>
                  <Input {...field} />
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
                <FormLabel>区分</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="fixed">固定費</SelectItem>
                    <SelectItem value="variable">変動費</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tooltip"
            render={({ field }) => (
              <FormItem>
                <FormLabel>補足説明（ツールチップ表示）</FormLabel>
                <FormControl>
                  <Input placeholder="例: 家賃、住宅ローン、管理費など" {...field} />
                </FormControl>
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
