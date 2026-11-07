import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Wallet } from 'lucide-react';

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
  loginEmailSchema,
  loginPasswordSchema,
  totpCodeSchema,
  type LoginEmailFormValues,
  type LoginPasswordFormValues,
  type TotpCodeFormValues,
} from '@/lib/auth-schema';
import { signInWithEmailPassword, type SignInResult } from '@/lib/auth';
import { discoverSignInMethod, signInWithPasskey } from '@/lib/passkey';

type Step = 'email' | 'passkey' | 'password' | 'mfaCode';

const STEP_DESCRIPTIONS: Record<Step, string> = {
  email: 'メールアドレスを入力してください',
  passkey: 'パスキーで本人確認します',
  password: 'パスワードを入力してください',
  mfaCode: '認証アプリに表示されている6桁のコードを入力してください',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [isPasskeySubmitting, setIsPasskeySubmitting] = useState(false);
  const [confirmMfaCode, setConfirmMfaCode] = useState<((code: string) => Promise<void>) | null>(
    null,
  );

  const emailForm = useForm<LoginEmailFormValues>({
    resolver: zodResolver(loginEmailSchema),
    defaultValues: { email: '' },
  });
  const passwordForm = useForm<LoginPasswordFormValues>({
    resolver: zodResolver(loginPasswordSchema),
    defaultValues: { password: '' },
  });
  const mfaForm = useForm<TotpCodeFormValues>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: '' },
  });

  // パスワード・パスキーのどちらのログインでも、TOTP MFA が必要なら同じ6桁コード入力へ合流させる。
  function handleSignInResult(result: SignInResult) {
    if (result.status === 'success') {
      navigate(redirect ?? '/dashboard');
      return;
    }
    setConfirmMfaCode(() => result.confirmMfaCode);
    setStep('mfaCode');
  }

  function goToStep(next: Step) {
    setError(null);
    setStep(next);
  }

  function backToEmail() {
    passwordForm.reset();
    goToStep('email');
  }

  // 入力されたメールアドレスのアカウントがパスキーを使えるかで、次の画面を分ける。
  // 判定に失敗してもパスワード画面に進むので、ここで例外は出ない。
  const onSubmitEmail = emailForm.handleSubmit(async (values) => {
    setError(null);
    setEmail(values.email);
    goToStep((await discoverSignInMethod(values.email)) === 'passkey' ? 'passkey' : 'password');
  });

  const onSubmitPassword = passwordForm.handleSubmit(async (values) => {
    setError(null);
    try {
      handleSignInResult(await signInWithEmailPassword({ email, password: values.password }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ログインに失敗しました');
    }
  });

  async function onPasskeyLogin() {
    setError(null);
    setIsPasskeySubmitting(true);
    try {
      handleSignInResult(await signInWithPasskey(email));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'パスキーでログインできませんでした');
    } finally {
      setIsPasskeySubmitting(false);
    }
  }

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

  const linkButtonClass = 'text-sm text-primary underline-offset-4 hover:underline';

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Wallet className="mb-2 size-8 text-primary" aria-hidden="true" />
          <CardTitle>ログイン</CardTitle>
          <CardDescription>{STEP_DESCRIPTIONS[step]}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'email' && (
            <Form key="email-form" {...emailForm}>
              <form onSubmit={onSubmitEmail} className="flex flex-col gap-4">
                <FormField
                  control={emailForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>メールアドレス</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={emailForm.formState.isSubmitting}
                  loading={emailForm.formState.isSubmitting}
                  className="mt-2"
                >
                  次へ
                </Button>
              </form>
            </Form>
          )}

          {step === 'passkey' && (
            <div className="flex flex-col gap-4">
              <p className="break-all text-center text-sm text-muted-foreground">{email}</p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {/* 認証器の呼び出しは直前のタップ操作が必要なブラウザがあるため、自動では開始せずボタンにする。 */}
              <Button
                type="button"
                disabled={isPasskeySubmitting}
                loading={isPasskeySubmitting}
                onClick={onPasskeyLogin}
              >
                <KeyRound aria-hidden="true" />
                パスキーで認証
              </Button>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  className={linkButtonClass}
                  disabled={isPasskeySubmitting}
                  onClick={() => goToStep('password')}
                >
                  パスワードでログインする
                </button>
                <button
                  type="button"
                  className={linkButtonClass}
                  disabled={isPasskeySubmitting}
                  onClick={backToEmail}
                >
                  別のメールアドレスを使う
                </button>
              </div>
            </div>
          )}

          {step === 'password' && (
            <Form key="password-form" {...passwordForm}>
              <form onSubmit={onSubmitPassword} className="flex flex-col gap-4">
                <p className="break-all text-center text-sm text-muted-foreground">{email}</p>
                {/* パスワードマネージャーが保存先のユーザー名を特定できるよう、メールを欄として残す。 */}
                <input
                  type="email"
                  name="username"
                  autoComplete="username"
                  value={email}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  className="sr-only"
                />
                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>パスワード</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="current-password"
                          autoFocus
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
                  disabled={passwordForm.formState.isSubmitting}
                  loading={passwordForm.formState.isSubmitting}
                  className="mt-2"
                >
                  ログイン
                </Button>
                <div className="flex flex-col items-center gap-2">
                  <button type="button" className={linkButtonClass} onClick={backToEmail}>
                    別のメールアドレスを使う
                  </button>
                </div>
              </form>
            </Form>
          )}

          {step === 'mfaCode' && (
            <Form key="mfa-form" {...mfaForm}>
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

          {step !== 'mfaCode' && (
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
