import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Users, Wallet, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentSession, signOut } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { acceptInvite, previewInvite } from '@/lib/household';

type SessionState =
  | { status: 'checking' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; email: string | null };

/**
 * 招待リンク（メールで届く `/join-household?token=...`）の受け皿ページ。
 *
 * `RequireAuth` の外（未ログインでもアクセスできる必要がある）に置くため、認証状態の確認は
 * `RequireAuth.tsx` と同じパターンでこのコンポーネント自身が行う。
 */
export default function JoinHouseholdPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  if (!token) {
    return (
      <CenteredCard>
        <CardHeader className="items-center text-center">
          <XCircle className="mb-2 size-8 text-destructive" aria-hidden="true" />
          <CardTitle>無効なリンクです</CardTitle>
          <CardDescription>招待リンクのURLが正しくありません。</CardDescription>
        </CardHeader>
        <CardContent>
          <BackToLoginLink />
        </CardContent>
      </CenteredCard>
    );
  }

  return <InvitePreviewSection token={token} />;
}

function InvitePreviewSection({ token }: { token: string }) {
  const previewQuery = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () => previewInvite(token),
    retry: false,
  });

  if (previewQuery.isLoading) {
    return (
      <CenteredCard>
        <CardHeader className="items-center text-center">
          <Wallet className="mb-2 size-8 text-primary" aria-hidden="true" />
          <CardTitle>招待を確認しています…</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </CenteredCard>
    );
  }

  if (previewQuery.isError || !previewQuery.data) {
    return (
      <CenteredCard>
        <CardHeader className="items-center text-center">
          <XCircle className="mb-2 size-8 text-destructive" aria-hidden="true" />
          <CardTitle>招待を確認できませんでした</CardTitle>
          <CardDescription>
            この招待リンクは無効か、有効期限が切れています。招待した方に再度招待をお願いしてください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BackToLoginLink />
        </CardContent>
      </CenteredCard>
    );
  }

  return <InviteAction token={token} preview={previewQuery.data} />;
}

function InviteAction({
  token,
  preview,
}: {
  token: string;
  preview: { householdName: string; invitedEmail: string; invitedByEmail: string };
}) {
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    getCurrentSession()
      .then((session) => {
        if (cancelled) return;
        if (!session) {
          setSessionState({ status: 'unauthenticated' });
          return;
        }
        setSessionState({
          status: 'authenticated',
          email: session.email,
        });
      })
      .catch(() => {
        if (!cancelled) setSessionState({ status: 'unauthenticated' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (sessionState.status === 'checking') {
    return (
      <CenteredCard>
        <CardHeader className="items-center text-center">
          <Wallet className="mb-2 size-8 text-primary" aria-hidden="true" />
          <CardTitle>{preview.householdName} への招待</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </CenteredCard>
    );
  }

  if (sessionState.status === 'unauthenticated') {
    const joinPath = `/join-household?token=${encodeURIComponent(token)}`;
    const loginHref = `/login?${new URLSearchParams({ redirect: joinPath }).toString()}`;
    const signupHref = `/signup?${new URLSearchParams({
      redirect: joinPath,
      email: preview.invitedEmail,
    }).toString()}`;

    return (
      <CenteredCard>
        <CardHeader className="items-center text-center">
          <Users className="mb-2 size-8 text-primary" aria-hidden="true" />
          <CardTitle>{preview.householdName} への招待</CardTitle>
          <CardDescription>
            {preview.invitedByEmail} さんから {preview.invitedEmail} 宛に招待が届いています。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild>
            <Link to={loginHref}>ログインして参加</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={signupHref}>新規登録して参加</Link>
          </Button>
        </CardContent>
      </CenteredCard>
    );
  }

  const emailMatches =
    sessionState.email !== null &&
    sessionState.email.toLowerCase() === preview.invitedEmail.toLowerCase();

  if (!emailMatches) {
    return (
      <CenteredCard>
        <CardHeader className="items-center text-center">
          <XCircle className="mb-2 size-8 text-destructive" aria-hidden="true" />
          <CardTitle>ログイン中のアカウントと招待先が異なります</CardTitle>
          <CardDescription>
            この招待は {preview.invitedEmail} 宛です。現在ログイン中のアカウント
            {sessionState.email ? `（${sessionState.email}）` : ''}
            とは異なるため、参加できません。ログアウトしてから招待されたメールアドレスで
            ログインし直してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogoutAndRelogin token={token} />
        </CardContent>
      </CenteredCard>
    );
  }

  return <AcceptInviteConfirm token={token} preview={preview} />;
}

function AcceptInviteConfirm({
  token,
  preview,
}: {
  token: string;
  preview: { householdName: string; invitedEmail: string; invitedByEmail: string };
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setIsSubmitting(true);
    setError(null);
    try {
      await acceptInvite(token);
      await queryClient.invalidateQueries({ queryKey: ['household'] });
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setError(describeAcceptInviteError(e));
      setIsSubmitting(false);
    }
  }

  return (
    <CenteredCard>
      <CardHeader className="items-center text-center">
        <Users className="mb-2 size-8 text-primary" aria-hidden="true" />
        <CardTitle>{preview.householdName} に参加しますか？</CardTitle>
        <CardDescription>
          {preview.invitedByEmail} さんの世帯に参加すると、取引・費目・予算のデータが 共有されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" disabled={isSubmitting} loading={isSubmitting} onClick={handleAccept}>
          参加する
        </Button>
        <BackToLoginLink />
      </CardContent>
    </CenteredCard>
  );
}

function LogoutAndRelogin({ token }: { token: string }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    const joinPath = `/join-household?token=${encodeURIComponent(token)}`;
    navigate(`/login?${new URLSearchParams({ redirect: joinPath }).toString()}`, {
      replace: true,
    });
  }

  return (
    <Button type="button" variant="outline" onClick={handleLogout}>
      <LogOut className="size-4" />
      ログアウトする
    </Button>
  );
}

function BackToLoginLink() {
  return (
    <p className="text-center text-sm text-muted-foreground">
      <Link to="/login" className="text-primary underline-offset-4 hover:underline">
        ログイン画面に戻る
      </Link>
    </p>
  );
}

function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">{children}</Card>
    </div>
  );
}

function describeAcceptInviteError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = (error.body as { code?: unknown } | undefined)?.code;
    if (code === 'INVITE_EXPIRED') return 'この招待は期限切れです';
    if (code === 'HOUSEHOLD_NOT_FRESH') return '既存のデータがあるため参加できません';
  }
  return error instanceof Error ? error.message : '世帯への参加に失敗しました';
}
