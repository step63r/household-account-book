import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  emailPasswordSchema,
  totpCodeSchema,
  type EmailPasswordFormValues,
  type TotpCodeFormValues,
} from '@/lib/auth-schema';
import { signInWithEmailPassword } from '@/lib/auth';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'password' | 'mfaCode'>('password');
  const [confirmMfaCode, setConfirmMfaCode] = useState<((code: string) => Promise<void>) | null>(
    null,
  );

  const form = useForm<EmailPasswordFormValues>({
    resolver: zodResolver(emailPasswordSchema),
    defaultValues: { email: '', password: '' },
  });
  const mfaForm = useForm<TotpCodeFormValues>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await signInWithEmailPassword(values);
      if (result.status === 'success') {
        navigate(redirect ?? '/dashboard');
        return;
      }
      setConfirmMfaCode(() => result.confirmMfaCode);
      setStep('mfaCode');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ログインに失敗しました');
    }
  });

  const onSubmitMfaCode = mfaForm.handleSubmit(async (values) => {
    if (!confirmMfaCode) return;
    setError(null);
    try {
      await confirmMfaCode(values.code);
      navigate(redirect ?? '/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : '認証コードの検証に失敗しました');
    }
  });

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Wallet className="mb-2 size-8 text-primary" aria-hidden="true" />
          <CardTitle>ログイン</CardTitle>
          <CardDescription>
            {step === 'password'
              ? '家計簿アプリにログインします'
              : '認証アプリに表示されている6桁のコードを入力してください'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'password' ? (
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
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>パスワード</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  loading={form.formState.isSubmitting}
                  className="mt-2"
                >
                  ログイン
                </Button>
              </form>
            </Form>
          ) : (
            <Form {...mfaForm}>
              <form onSubmit={onSubmitMfaCode} className="flex flex-col gap-4">
                <FormField
                  control={mfaForm.control}
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
                <Button
                  type="submit"
                  disabled={mfaForm.formState.isSubmitting}
                  loading={mfaForm.formState.isSubmitting}
                  className="mt-2"
                >
                  確認する
                </Button>
              </form>
            </Form>
          )}
          {step === 'password' && (
            <>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                アカウントをお持ちでない方は{' '}
                <Link to="/signup" className="text-primary underline-offset-4 hover:underline">
                  新規登録
                </Link>
              </p>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                <Link
                  to="/reset-password"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  パスワードをお忘れですか？
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
