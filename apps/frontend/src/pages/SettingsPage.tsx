import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { requestAccountWithdrawal } from '@/lib/account';
import { confirmEmailChange, getCurrentSession, requestEmailChange, signOut } from '@/lib/auth';
import {
  changeEmailSchema,
  confirmSignUpSchema,
  type ChangeEmailFormValues,
  type ConfirmSignUpFormValues,
} from '@/lib/auth-schema';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // ID トークンの email クレームから表示する（GET /users/me 相当のバックエンドAPIはまだ無い）
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentSession().then((session) => {
      if (cancelled || !session) return;
      const claim = session.getIdToken().payload.email;
      if (typeof claim === 'string') setEmail(claim);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleWithdraw() {
    setIsSubmitting(true);
    setWithdrawalError(null);
    try {
      await requestAccountWithdrawal();
      // 退会（論理削除）を受け付けたら、このセッションは以後使えないためログアウトする。
      signOut();
      navigate('/login', { replace: true });
    } catch (e) {
      setWithdrawalError(e instanceof Error ? e.message : '退会処理に失敗しました');
      setIsSubmitting(false);
    }
  }

  function handleSignOut() {
    signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">設定</h1>
        <p className="text-sm text-muted-foreground">アカウント情報の確認・退会手続きを行えます</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>アカウント情報</CardTitle>
          <CardDescription>ログイン中のアカウントの情報です</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between border-b border-border py-2">
            <span className="text-muted-foreground">メールアドレス</span>
            <span className="font-medium">{email ?? '未ログイン'}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-muted-foreground">ステータス</span>
            <span className="font-medium">active</span>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="button" variant="outline" onClick={handleSignOut}>
            <LogOut className="size-4" />
            ログアウト
          </Button>
        </CardFooter>
      </Card>

      <ChangeEmailCard onEmailChanged={setEmail} />

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">退会</CardTitle>
          <CardDescription>
            退会すると、すぐにログインできなくなります。データは退会操作時点で論理削除され、
            30日程度の猶予期間後に完全に削除されます。
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="destructive">
                退会する
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
                  本当に退会しますか？
                </DialogTitle>
                <DialogDescription>
                  この操作は取り消せません。退会後30日程度でアカウント情報・取引データが完全に削除されます。
                </DialogDescription>
              </DialogHeader>
              {withdrawalError && <p className="text-sm text-destructive">{withdrawalError}</p>}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    キャンセル
                  </Button>
                </DialogClose>
                <Button type="button" variant="destructive" disabled={isSubmitting} onClick={handleWithdraw}>
                  退会する
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardFooter>
      </Card>
    </div>
  );
}

function ChangeEmailCard({ onEmailChanged }: { onEmailChanged: (email: string) => void }) {
  const [pendingNewEmail, setPendingNewEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const requestForm = useForm<ChangeEmailFormValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: '' },
  });

  const onSubmitRequest = requestForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await requestEmailChange(values.newEmail);
      setPendingNewEmail(values.newEmail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'メールアドレスの変更に失敗しました');
    }
  });

  if (pendingNewEmail) {
    return (
      <ConfirmEmailChangeCard
        newEmail={pendingNewEmail}
        onBack={() => setPendingNewEmail(null)}
        onConfirmed={() => {
          onEmailChanged(pendingNewEmail);
          setPendingNewEmail(null);
          setSuccessMessage('メールアドレスを変更しました');
          requestForm.reset({ newEmail: '' });
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>メールアドレス変更</CardTitle>
        <CardDescription>
          新しいメールアドレス宛に確認コードを送信します。コードを入力すると変更が完了します。
        </CardDescription>
      </CardHeader>
      <CardContent>
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
            {successMessage && <p className="text-sm text-muted-foreground">{successMessage}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={requestForm.formState.isSubmitting} className="self-start">
              確認コードを送信
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function ConfirmEmailChangeCard({
  newEmail,
  onBack,
  onConfirmed,
}: {
  newEmail: string;
  onBack: () => void;
  onConfirmed: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const confirmForm = useForm<ConfirmSignUpFormValues>({
    resolver: zodResolver(confirmSignUpSchema),
    defaultValues: { code: '' },
  });

  const onSubmitConfirm = confirmForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await confirmEmailChange(values.code);
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : '確認コードの検証に失敗しました');
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>メールアドレス変更</CardTitle>
        <CardDescription>{newEmail} 宛に届いた確認コードを入力してください</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...confirmForm}>
          <form onSubmit={onSubmitConfirm} className="flex flex-col gap-4">
            <FormField
              control={confirmForm.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>確認コード</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" autoComplete="one-time-code" placeholder="123456" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={confirmForm.formState.isSubmitting} className="self-start">
              確認する
            </Button>
            <Button type="button" variant="ghost" onClick={onBack} className="self-start">
              メールアドレスを変更し直す
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
