import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
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
  createCategoryInputSchema,
  type Category,
  type CreateCategoryInput,
} from '@household/shared';

import { Badge } from '@/components/ui/badge';
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
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  createCategory,
  deleteCategory,
  getCategories,
  reorderCategories,
  updateCategory,
} from '@/lib/categories';
import { EMPTY_ARRAY } from '@/lib/utils';

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => getCategories(),
  });
  const categories = categoriesQuery.data ?? EMPTY_ARRAY;

  const sortedCategories = useMemo(
    () => categories.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );

  const [dialogState, setDialogState] = useState<{ open: boolean; category: Category | null }>({
    open: false,
    category: null,
  });

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

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
      setDeleteTarget(null);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => reorderCategories(orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: ['categories'] });
      const previous = queryClient.getQueryData<Category[]>(['categories']);
      queryClient.setQueryData<Category[]>(['categories'], (old) => {
        if (!old) return old;
        const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
        return old.map((c) => ({ ...c, sortOrder: orderMap.get(c.id) ?? c.sortOrder }));
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['categories'], context.previous);
      }
    },
    onSettled: () => {
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
      <Dialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))}
      >
        <DialogTrigger asChild>
          <Button
            onClick={openCreateDialog}
            size="icon"
            aria-label="費目を追加"
            className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 size-14 rounded-full shadow-lg md:right-8 md:bottom-8"
          >
            <Plus className="size-6" />
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

      <CategoryListCard
        categories={sortedCategories}
        onEdit={openEditDialog}
        onDelete={setDeleteTarget}
        onReorder={(orderedIds) => reorderMutation.mutate(orderedIds)}
      />

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

function CategoryListCard({
  categories,
  onEdit,
  onDelete,
  onReorder,
}: {
  categories: Category[];
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  onReorder: (orderedIds: string[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>費目</CardTitle>
        <CardDescription>{categories.length} 件</CardDescription>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">費目がありません</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => {
              const { active, over } = event;
              if (!over || active.id === over.id) return;
              const oldIndex = categories.findIndex((c) => c.id === active.id);
              const newIndex = categories.findIndex((c) => c.id === over.id);
              onReorder(arrayMove(categories, oldIndex, newIndex).map((c) => c.id));
            }}
          >
            <SortableContext
              items={categories.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex flex-col divide-y divide-border">
                {categories.map((c) => (
                  <SortableCategoryRow
                    key={c.id}
                    category={c}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}

function SortableCategoryRow({
  category,
  onEdit,
  onDelete,
}: {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
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
        <span className="text-sm font-medium">{category.name}</span>
        <Badge variant={category.type === 'fixed' ? 'default' : 'secondary'}>
          {category.type === 'fixed' ? '固定費' : '変動費'}
        </Badge>
        {category.tooltip && (
          <InfoTooltip label={`${category.name}の説明`}>{category.tooltip}</InfoTooltip>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="編集"
          onClick={() => onEdit(category)}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="削除"
          onClick={() => onDelete(category)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
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
