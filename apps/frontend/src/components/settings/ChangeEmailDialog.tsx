import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

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
import { confirmEmailChange, requestEmailChange } from '@/lib/auth';
import {
  changeEmailSchema,
  confirmSignUpSchema,
  type ChangeEmailFormValues,
  type ConfirmSignUpFormValues,
} from '@/lib/auth-schema';

export function ChangeEmailDialog({
  onEmailChanged,
  onSuccess,
}: {
  onEmailChanged: (email: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [pendingNewEmail, setPendingNewEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestForm = useForm<ChangeEmailFormValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: '' },
  });
  const confirmForm = useForm<ConfirmSignUpFormValues>({
    resolver: zodResolver(confirmSignUpSchema),
    defaultValues: { code: '' },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setStep('request');
      setPendingNewEmail(null);
      setError(null);
      requestForm.reset({ newEmail: '' });
      confirmForm.reset({ code: '' });
    }
  }

  const onSubmitRequest = requestForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await requestEmailChange(values.newEmail);
      setPendingNewEmail(values.newEmail);
      setStep('confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'メールアドレスの変更に失敗しました');
    }
  });

  const onSubmitConfirm = confirmForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await confirmEmailChange(values.code);
      if (pendingNewEmail) onEmailChanged(pendingNewEmail);
      onSuccess('メールアドレスを変更しました');
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '確認コードの検証に失敗しました');
    }
  });

  function backToRequest() {
    setStep('request');
    setError(null);
    confirmForm.reset({ code: '' });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          メールアドレスを変更
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>メールアドレス変更</DialogTitle>
          <DialogDescription>
            {step === 'request'
              ? '新しいメールアドレス宛に確認コードを送信します。コードを入力すると変更が完了します。'
              : `${pendingNewEmail} 宛に届いた確認コードを入力してください`}
          </DialogDescription>
        </DialogHeader>

        {step === 'request' ? (
          <Form {...requestForm}>
            <form onSubmit={onSubmitRequest} className="flex flex-col gap-4">
              <FormField
                control={requestForm.control}
                name="newEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>新しいメールアドレス</FormLabel>
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
                  disabled={requestForm.formState.isSubmitting}
                  loading={requestForm.formState.isSubmitting}
                >
                  確認コードを送信
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <Form {...confirmForm}>
            <form onSubmit={onSubmitConfirm} className="flex flex-col gap-4">
              <FormField
                control={confirmForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>確認コード</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={backToRequest}>
                  メールアドレスを変更し直す
                </Button>
                <Button
                  type="submit"
                  disabled={confirmForm.formState.isSubmitting}
                  loading={confirmForm.formState.isSubmitting}
                >
                  確認する
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
