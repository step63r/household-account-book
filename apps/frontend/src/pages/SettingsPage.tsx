import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogOut } from 'lucide-react';

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
import { getCurrentSession, requestAccountWithdrawal, signOut } from '@/lib/auth';

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
    } catch (e) {
      setWithdrawalError(e instanceof Error ? e.message : '退会処理に失敗しました');
    } finally {
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
