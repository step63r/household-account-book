import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { updateHouseholdInputSchema, type UpdateHouseholdInput } from '@household/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { updateHouseholdName } from '@/lib/household';

export function EditHouseholdNameDialog({
  currentName,
  onSuccess,
}: {
  currentName: string;
  onSuccess: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<UpdateHouseholdInput>({
    resolver: zodResolver(updateHouseholdInputSchema),
    defaultValues: { name: currentName },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset({ name: currentName });
    } else {
      setError(null);
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await updateHouseholdName(values.name);
      await queryClient.invalidateQueries({ queryKey: ['household'] });
      onSuccess('世帯名を変更しました');
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '世帯名の変更に失敗しました');
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Pencil className="size-4" />
          編集
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>世帯名を変更</DialogTitle>
          <DialogDescription>
            この世帯を共有するメンバー全員に表示される名前です。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>世帯名</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                loading={form.formState.isSubmitting}
              >
                保存
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
