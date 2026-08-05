import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { QRCodeSVG } from 'qrcode.react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogClose,
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
import { confirmMfaEnrollment, disableMfa, getMfaStatus, startMfaEnrollment } from '@/lib/auth';
import { totpCodeSchema, type TotpCodeFormValues } from '@/lib/auth-schema';

const ISSUER = '家計簿アプリ';

function buildOtpAuthUri(email: string, secretCode: string): string {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  return `otpauth://totp/${label}?secret=${secretCode}&issuer=${encodeURIComponent(ISSUER)}`;
}

function EnrollDialog({
  email,
  onEnrolled,
}: {
  email: string | null;
  onEnrolled: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'start' | 'confirm'>('start');
  const [secretCode, setSecretCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmForm = useForm<TotpCodeFormValues>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: '' },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setStep('start');
      setSecretCode(null);
      setError(null);
      confirmForm.reset({ code: '' });
      startMfaEnrollment()
        .then(({ secretCode }) => {
          setSecretCode(secretCode);
          setStep('confirm');
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'MFA設定の開始に失敗しました');
        });
    }
  }

  const onSubmitConfirm = confirmForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await confirmMfaEnrollment(values.code);
      onEnrolled('二要素認証を設定しました');
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '認証コードの検証に失敗しました');
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          設定する
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>二要素認証を設定</DialogTitle>
          <DialogDescription>
            Microsoft
            Authenticatorなどの認証アプリでQRコードを読み取り、表示された6桁のコードを入力してください。
          </DialogDescription>
        </DialogHeader>

        {secretCode && email && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-md bg-white p-3">
              <QRCodeSVG value={buildOtpAuthUri(email, secretCode)} size={160} />
            </div>
            <p className="break-all text-center text-xs text-muted-foreground">
              読み取れない場合はこのコードを手入力してください: <br />
              <span className="font-mono">{secretCode}</span>
            </p>
          </div>
        )}

        {step === 'confirm' && (
          <Form {...confirmForm}>
            <form onSubmit={onSubmitConfirm} className="flex flex-col gap-4">
              <FormField
                control={confirmForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>認証コード</FormLabel>
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

        {step === 'start' && error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({ onDisabled }: { onDisabled: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisable() {
    setIsSubmitting(true);
    setError(null);
    try {
      await disableMfa();
      onDisabled('二要素認証を無効化しました');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MFAの無効化に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          無効化
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>二要素認証を無効化しますか？</DialogTitle>
          <DialogDescription>
            次回以降のログインでは認証コードの入力が不要になります。
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              キャンセル
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={isSubmitting}
            loading={isSubmitting}
            onClick={handleDisable}
          >
            無効化する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MfaSection({
  email,
  onSuccess,
}: {
  email: string | null;
  onSuccess: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  function refreshStatus() {
    getMfaStatus()
      .then(setEnabled)
      .catch(() => setEnabled(null));
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  function handleChanged(message: string) {
    onSuccess(message);
    refreshStatus();
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
      <div>
        <p className="text-sm font-medium">二要素認証（MFA）</p>
        <p className="text-sm text-muted-foreground">
          {enabled ? '有効' : '無効'} - 認証アプリの6桁コードでログインを保護します
        </p>
      </div>
      {enabled ? (
        <DisableDialog onDisabled={handleChanged} />
      ) : (
        <EnrollDialog email={email} onEnrolled={handleChanged} />
      )}
    </div>
  );
}
