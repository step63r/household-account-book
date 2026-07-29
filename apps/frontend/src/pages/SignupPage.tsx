import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { MailCheck, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  confirmSignUpSchema,
  signUpSchema,
  type ConfirmSignUpFormValues,
  type SignUpFormValues,
} from '@/lib/auth-schema';
import {
  confirmSignUp,
  signInWithEmailPassword,
  signUpWithEmailPassword,
  type EmailPasswordCredentials,
} from '@/lib/auth';
import { LegalContent } from '@/content/legalContent';
import { recordConsent } from '@/lib/consent';

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  // サインアップ成功後、Cognito のメール確認コード入力ステップへ進む
  // 確認コード検証後に自動ログインするため、パスワードも一時的に保持しておく
  const [pendingCredentials, setPendingCredentials] = useState<EmailPasswordCredentials | null>(null);

  const signUpForm = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', agreedToTerms: false },
  });
  const agreedToTerms = signUpForm.watch('agreedToTerms');

  const onSubmitSignUp = signUpForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await signUpWithEmailPassword(values);
      setPendingCredentials({ email: values.email, password: values.password });
    } catch (e) {
      setError(e instanceof Error ? e.message : '新規登録に失敗しました');
    }
  });

  if (pendingCredentials) {
    return (
      <ConfirmSignUpForm
        email={pendingCredentials.email}
        password={pendingCredentials.password}
        onBackToSignUp={() => setPendingCredentials(null)}
      />
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Wallet className="mb-2 size-8 text-primary" aria-hidden="true" />
          <CardTitle>新規登録</CardTitle>
          <CardDescription>メールアドレスとパスワードで登録します</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...signUpForm}>
            <form onSubmit={onSubmitSignUp} className="flex flex-col gap-4">
              <FormField
                control={signUpForm.control}
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
                control={signUpForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>パスワード</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="max-h-48 overflow-y-auto rounded-md border p-3 text-xs">
                <LegalContent />
              </div>
              <FormField
                control={signUpForm.control}
                name="agreedToTerms"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">
                        上記の利用規約およびプライバシーポリシーに同意します
                      </FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={!agreedToTerms || signUpForm.formState.isSubmitting}
                loading={signUpForm.formState.isSubmitting}
                className="mt-2"
              >
                登録する
              </Button>
            </form>
          </Form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            既にアカウントをお持ちの方は{' '}
            <Link to="/login" className="text-primary underline-offset-4 hover:underline">
              ログイン
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfirmSignUpForm({
  email,
  password,
  onBackToSignUp,
}: {
  email: string;
  password: string;
  onBackToSignUp: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const confirmForm = useForm<ConfirmSignUpFormValues>({
    resolver: zodResolver(confirmSignUpSchema),
    defaultValues: { code: '' },
  });

  const onSubmitConfirm = confirmForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await confirmSignUp({ email, code: values.code });
    } catch (e) {
      setError(e instanceof Error ? e.message : '確認コードの検証に失敗しました');
      return;
    }

    // 確認自体は完了しているため、自動ログインに失敗してもログイン画面へ誘導する（登録をやり直させない）
    try {
      await signInWithEmailPassword({ email, password });
    } catch {
      navigate('/login');
      return;
    }

    // サインアップ画面で既に同意済みのため、ここで記録しておく。RequireAuth が直後に
    // 同意状況を再取得して同じ結果を再度問い合わせるのを避けるため、キャッシュへ直接反映する
    // （失敗しても致命的ではない - 次回 RequireAuth のチェックで /consent に誘導されるだけ）
    try {
      const status = await recordConsent();
      queryClient.setQueryData(['consent-status'], status);
    } catch {
      // no-op: 同意記録に失敗しても /consent へのフォールバックで救済される
    }

    navigate('/dashboard');
  });

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <MailCheck className="mb-2 size-8 text-primary" aria-hidden="true" />
          <CardTitle>メールアドレスの確認</CardTitle>
          <CardDescription>
            {email} 宛に届いた確認コードを入力してください
          </CardDescription>
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
                disabled={confirmForm.formState.isSubmitting}
                loading={confirmForm.formState.isSubmitting}
                className="mt-2"
              >
                確認する
              </Button>
              <Button type="button" variant="ghost" onClick={onBackToSignUp}>
                登録内容を修正する
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
