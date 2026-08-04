import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LogOut, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { ChangeEmailDialog } from '@/components/settings/ChangeEmailDialog';
import { ChangePasswordDialog } from '@/components/settings/ChangePasswordDialog';
import { InviteMemberDialog } from '@/components/settings/InviteMemberDialog';
import { requestAccountWithdrawal } from '@/lib/account';
import { getCurrentSession, signOut } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { leaveHousehold, useHousehold } from '@/lib/household';
import { formatDateTimeJst } from '@/lib/date';

export default function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // ID トークンの email クレームから表示する（GET /users/me 相当のバックエンドAPIはまだ無い）
  const [email, setEmail] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const householdQuery = useHousehold();
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [isLeavingHousehold, setIsLeavingHousehold] = useState(false);
  const [leaveHouseholdError, setLeaveHouseholdError] = useState<string | null>(null);

  function handleSuccess(message: string) {
    setSuccessMessage(message);
  }

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

  async function handleLeaveHousehold() {
    setIsLeavingHousehold(true);
    setLeaveHouseholdError(null);
    try {
      await leaveHousehold();
      await queryClient.invalidateQueries({ queryKey: ['household'] });
      setLeaveDialogOpen(false);
      handleSuccess('世帯から脱退しました');
    } catch (e) {
      const code =
        e instanceof ApiError ? (e.body as { code?: unknown } | undefined)?.code : undefined;
      if (code === 'SOLE_MEMBER') {
        setLeaveHouseholdError(
          '世帯のメンバーが自分のみのため脱退できません。退会をご検討ください。',
        );
      } else {
        setLeaveHouseholdError(e instanceof Error ? e.message : '世帯からの脱退に失敗しました');
      }
    } finally {
      setIsLeavingHousehold(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">設定</h1>
        <p className="text-sm text-muted-foreground">アカウント情報の確認・退会手続きを行えます</p>
      </div>

      {successMessage && <p className="text-sm text-muted-foreground">{successMessage}</p>}

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

      <Card>
        <CardHeader>
          <CardTitle>セキュリティ</CardTitle>
          <CardDescription>メールアドレスやパスワードを変更します</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">メールアドレス</p>
              <p className="text-sm text-muted-foreground">
                ログインに使用するメールアドレスを変更します
              </p>
            </div>
            <ChangeEmailDialog onEmailChanged={setEmail} onSuccess={handleSuccess} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <div>
              <p className="text-sm font-medium">パスワード</p>
              <p className="text-sm text-muted-foreground">ログインパスワードを変更します</p>
            </div>
            <ChangePasswordDialog onSuccess={handleSuccess} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>世帯</CardTitle>
          <CardDescription>家族と家計データ（取引・費目・予算）を共有します</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {householdQuery.isLoading && <p className="text-muted-foreground">読み込み中...</p>}
          {householdQuery.isError && (
            <p className="text-destructive">世帯情報の取得に失敗しました</p>
          )}
          {householdQuery.data && (
            <>
              <div className="flex items-center justify-between border-b border-border py-2">
                <span className="text-muted-foreground">世帯名</span>
                <span className="font-medium">{householdQuery.data.name}</span>
              </div>
              <div>
                <p className="mb-2 font-medium">メンバー</p>
                <ul className="flex flex-col gap-2">
                  {householdQuery.data.members.map((member) => (
                    <li
                      key={member.userId}
                      className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
                    >
                      <span>{member.email}</span>
                      <span className="text-muted-foreground">
                        {formatDateTimeJst(member.joinedAt)} 参加
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-3">
          <InviteMemberDialog onSuccess={handleSuccess} />

          <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={(householdQuery.data?.members.length ?? 0) <= 1}
              >
                <Users className="size-4" />
                世帯から抜ける
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>世帯から抜けますか？</DialogTitle>
                <DialogDescription>
                  抜けると新しい世帯（データなし）が作成されます。共有していたデータは元の世帯に残り、
                  引き続き他のメンバーが利用できます。
                </DialogDescription>
              </DialogHeader>
              {leaveHouseholdError && (
                <p className="text-sm text-destructive">{leaveHouseholdError}</p>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    キャンセル
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isLeavingHousehold}
                  loading={isLeavingHousehold}
                  onClick={handleLeaveHousehold}
                >
                  抜ける
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {(householdQuery.data?.members.length ?? 0) <= 1 && (
            <p className="w-full text-xs text-muted-foreground">
              世帯のメンバーが自分のみのため脱退できません。アカウントごと利用をやめる場合は下記の退会をご利用ください。
            </p>
          )}
        </CardFooter>
      </Card>

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
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isSubmitting}
                  loading={isSubmitting}
                  onClick={handleWithdraw}
                >
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
