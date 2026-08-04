import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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
import { createInvite } from '@/lib/household';

/**
 * 招待は Cognito 認証操作ではなく通常のバックエンド API 呼び出しのため、
 * `src/lib/auth-schema.ts` ではなくこのファイルにローカルでスキーマを定義する。
 */
const inviteMemberSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください')
    .email('メールアドレスの形式が正しくありません'),
});
type InviteMemberFormValues = z.infer<typeof inviteMemberSchema>;

export function InviteMemberDialog({ onSuccess }: { onSuccess: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<InviteMemberFormValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: '' },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
      form.reset({ email: '' });
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await createInvite(values.email);
      onSuccess(`${result.invitedEmail} 宛に招待メールを送信しました`);
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '招待メールの送信に失敗しました');
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          招待する
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>世帯に招待</DialogTitle>
          <DialogDescription>
            招待したい相手のメールアドレスを入力してください。招待メールに記載されたリンクから、
            相手が参加を承諾すると同じ世帯のデータを共有できるようになります。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>メールアドレス</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" {...field} />
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
                招待メールを送信
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
