import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { LegalContent } from '@/content/legalContent';
import { recordConsent } from '@/lib/consent';
import { signOut } from '@/lib/auth';

/**
 * 利用規約・プライバシーポリシー改定時の強制再同意ゲート画面。
 * `RequireAuth` から `mustAgree: true` の間はここへリダイレクトされる（ダイアログではなく
 * 独立ページなのは、Escape/オーバーレイクリックで閉じられてしまう Dialog は強制ゲートに不適切なため）。
 * 選択肢は「同意して続ける」か「ログアウト」の二択のみ。
 */
export default function ConsentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // RequireAuth からのリダイレクト時に元々のアクセス先を state.from に積んでいる（無ければダッシュボードへ）
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard';

  const handleAgree = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const status = await recordConsent();
      // RequireAuth は同じインスタンスのまま Outlet の中身だけ切り替わるため、
      // React Query キャッシュを直接更新して再フェッチなしに mustAgree: false を反映する
      queryClient.setQueryData(['consent-status'], status);
      navigate(from, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '同意の記録に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader className="items-center text-center">
          <ShieldCheck className="mb-2 size-8 text-primary" aria-hidden="true" />
          <CardTitle>利用規約・プライバシーポリシーの改定について</CardTitle>
          <CardDescription>
            内容が更新されました。引き続きご利用いただくには、改めて同意いただく必要があります。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto rounded-md border p-4">
            <LegalContent />
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <Checkbox checked={agreed} onCheckedChange={(checked) => setAgreed(checked === true)} />
            <span>上記の利用規約およびプライバシーポリシーの内容に同意します</span>
          </label>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleLogout}>
            ログアウト
          </Button>
          <Button
            type="button"
            disabled={!agreed || isSubmitting}
            loading={isSubmitting}
            onClick={handleAgree}
          >
            同意して続ける
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
