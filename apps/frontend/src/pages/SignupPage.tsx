import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { emailPasswordSchema, type EmailPasswordFormValues } from '@/lib/auth-schema';
import { signUpWithEmailPassword } from '@/lib/auth';

export default function SignupPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<EmailPasswordFormValues>({
    resolver: zodResolver(emailPasswordSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await signUpWithEmailPassword(values);
      navigate('/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : '新規登録に失敗しました');
    }
  });

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Wallet className="mb-2 size-8 text-primary" aria-hidden="true" />
          <CardTitle>新規登録</CardTitle>
          <CardDescription>メールアドレスとパスワードで登録します</CardDescription>
        </CardHeader>
        <CardContent>
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
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={form.formState.isSubmitting} className="mt-2">
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
