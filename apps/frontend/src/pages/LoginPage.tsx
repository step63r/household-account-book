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
  mfaCodeSchema,
  type EmailPasswordFormValues,
  type MfaCodeFormValues,
} from '@/lib/auth-schema';
import { signInWithEmailPassword, type SignInResult } from '@/lib/auth';

type Step =
  | { name: 'password' }
  | {
      name: 'mfaCode';
      method: 'TOTP' | 'EMAIL';
      confirmCode: (code: string) => Promise<SignInResult>;
    }
  | {
      name: 'mfaSelection';
      options: ('TOTP' | 'EMAIL')[];
      selectMethod: (method: 'TOTP' | 'EMAIL') => Promise<SignInResult>;
    };

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ name: 'password' });
  const [isSelecting, setIsSelecting] = useState(false);

  const form = useForm<EmailPasswordFormValues>({
    resolver: zodResolver(emailPasswordSchema),
    defaultValues: { email: '', password: '' },
  });
  const mfaForm = useForm<MfaCodeFormValues>({
    resolver: zodResolver(mfaCodeSchema),
    defaultValues: { code: '' },
  });

  function handleSignInResult(result: SignInResult) {
    if (result.status === 'success') {
      navigate(redirect ?? '/dashboard');
      return;
    }
    if (result.status === 'mfaCodeRequired') {
      mfaForm.reset({ code: '' });
      setStep({ name: 'mfaCode', method: result.method, confirmCode: result.confirmCode });
      return;
    }
    // mfaSelectionRequired: 設計上は常にどちらか一方のみを有効化するため通常は発生しないが、
    // 選択肢が1つだけならそのまま自動選択して進める（複数ある場合のみ選択ボタンを出す）
    const [onlyOption] = result.options;
    if (onlyOption && result.options.length === 1) {
      setIsSelecting(true);
      result
        .selectMethod(onlyOption)
        .then(handleSignInResult)
        .catch((e) => setError(e instanceof Error ? e.message : 'MFA方式の選択に失敗しました'))
        .finally(() => setIsSelecting(false));
      return;
    }
    setStep({ name: 'mfaSelection', options: result.options, selectMethod: result.selectMethod });
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await signInWithEmailPassword(values);
      handleSignInResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ログインに失敗しました');
    }
  });

  const onSubmitMfaCode = mfaForm.handleSubmit(async (values) => {
    if (step.name !== 'mfaCode') return;
    setError(null);
    try {
      const result = await step.confirmCode(values.code);
      handleSignInResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '認証コードの検証に失敗しました');
    }
  });

  async function handleSelectMethod(method: 'TOTP' | 'EMAIL') {
    if (step.name !== 'mfaSelection') return;
    setError(null);
    setIsSelecting(true);
    try {
      const result = await step.selectMethod(method);
      handleSignInResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MFA方式の選択に失敗しました');
    } finally {
      setIsSelecting(false);
    }
  }

  const mfaCodeLabel =
    step.name === 'mfaCode' && step.method === 'EMAIL'
      ? 'メールに届いた6桁のコード'
      : '認証アプリに表示されている6桁のコード';

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Wallet className="mb-2 size-8 text-primary" aria-hidden="true" />
          <CardTitle>ログイン</CardTitle>
          <CardDescription>
            {step.name === 'password' && '家計簿アプリにログインします'}
            {step.name === 'mfaCode' && `${mfaCodeLabel}を入力してください`}
            {step.name === 'mfaSelection' && '二要素認証の方式を選択してください'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step.name === 'password' && (
            <Form key="password-form" {...form}>
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
          )}

          {step.name === 'mfaCode' && (
            <Form key={`mfa-code-form-${step.method}`} {...mfaForm}>
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

          {step.name === 'mfaSelection' && (
            <div key="mfa-selection" className="flex flex-col gap-3">
              {step.options.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  disabled={isSelecting}
                  loading={isSelecting}
                  onClick={() => handleSelectMethod(option)}
                >
                  {option === 'TOTP' ? '認証アプリ' : 'メール'}
                </Button>
              ))}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          {step.name === 'password' && (
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
