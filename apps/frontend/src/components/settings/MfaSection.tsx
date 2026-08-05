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
import {
  confirmTotpEnrollment,
  disableMfa,
  enableEmailMfa,
  getMfaStatus,
  startTotpEnrollment,
  type MfaMethod,
} from '@/lib/auth';
import { mfaCodeSchema, type MfaCodeFormValues } from '@/lib/auth-schema';

const STATUS_LABEL: Record<MfaMethod, string> = {
  NONE: '無効',
  TOTP: '有効（認証アプリ）',
  EMAIL: '有効（メール）',
};

type Step = 'choose' | 'totpConfirm';

function MfaChangeDialog({
  email,
  current,
  onChanged,
}: {
  email: string | null;
  current: MfaMethod;
  onChanged: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('choose');
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const confirmForm = useForm<MfaCodeFormValues>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: '' },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setStep('choose');
      setTotpUri(null);
      setTotpSecret(null);
      setError(null);
      confirmForm.reset({ code: '' });
    }
  }

  async function handleChooseTotp() {
    if (!email) return;
    setError(null);
    setIsProcessing(true);
    try {
      const { uri, secret } = await startTotpEnrollment(email);
      setTotpUri(uri);
      setTotpSecret(secret);
      setStep('totpConfirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MFA設定の開始に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleChooseEmail() {
    setError(null);
    setIsProcessing(true);
    try {
      await enableEmailMfa();
      onChanged('二要素認証をメールに設定しました');
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MFA設定に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  }

  const onSubmitTotpConfirm = confirmForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await confirmTotpEnrollment(values.code);
      onChanged('二要素認証を認証アプリに設定しました');
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '認証コードの検証に失敗しました');
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {current === 'NONE' ? '設定する' : '変更する'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>二要素認証を設定</DialogTitle>
          <DialogDescription>
            {step === 'choose'
              ? 'ログイン時に使う二要素認証の方式を選んでください。'
              : 'Microsoft Authenticatorなどの認証アプリでQRコードを読み取り、表示された6桁のコードを入力してください。'}
          </DialogDescription>
        </DialogHeader>

        {step === 'choose' && (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isProcessing}
              loading={isProcessing}
              onClick={handleChooseTotp}
            >
              認証アプリ（Microsoft Authenticatorなど）
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isProcessing}
              loading={isProcessing}
              onClick={handleChooseEmail}
            >
              メールに届く6桁コード
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {step === 'totpConfirm' && (
          <>
            {totpUri && (
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-md bg-white p-3">
                  <QRCodeSVG value={totpUri} size={160} />
                </div>
                {totpSecret && (
                  <p className="break-all text-center text-xs text-muted-foreground">
                    読み取れない場合はこのコードを手入力してください: <br />
                    <span className="font-mono">{totpSecret}</span>
                  </p>
                )}
              </div>
            )}
            <Form {...confirmForm}>
              <form onSubmit={onSubmitTotpConfirm} className="flex flex-col gap-4">
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
                  <Button type="button" variant="ghost" onClick={() => setStep('choose')}>
                    方式を選び直す
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MfaDisableDialog({ onDisabled }: { onDisabled: (message: string) => void }) {
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
  const [status, setStatus] = useState<MfaMethod | null>(null);

  function refreshStatus() {
    getMfaStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  function handleChanged(message: string) {
    onSuccess(message);
    refreshStatus();
  }

  const current = status ?? 'NONE';

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
      <div>
        <p className="text-sm font-medium">二要素認証（MFA）</p>
        <p className="text-sm text-muted-foreground">
          {STATUS_LABEL[current]} - 認証アプリまたはメールの6桁コードでログインを保護します
        </p>
      </div>
      <div className="flex items-center gap-2">
        <MfaChangeDialog email={email} current={current} onChanged={handleChanged} />
        {current !== 'NONE' && <MfaDisableDialog onDisabled={handleChanged} />}
      </div>
    </div>
  );
}
