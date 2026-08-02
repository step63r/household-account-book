import { Info } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * 無料プランの参照可能期間制限（直近3ヶ月）を知らせる案内カード。
 *
 * 2通りの状況で表示される想定:
 *  - プランが free と判明している間は常に表示（Dashboard/Transactions 側で
 *    `plan === 'free'` を判定して表示する）
 *  - 何らかの理由でクライアント側の制限（日付ピッカーの min 属性等）をすり抜けて
 *    範囲外のリクエストが飛び、バックエンドが 403 PLAN_RESTRICTED を返した場合
 *    （`isPlanRestrictedError` で判定）
 *
 * 支払い導線はまだ存在しないため、アップグレード等のCTAは付けず情報表示のみ行う。
 */
export function PlanRestrictionNotice({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="flex items-start gap-3 py-4 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">無料プラン</Badge>
          <span className="text-muted-foreground">
            無料プランでは直近3ヶ月分のデータのみ表示・登録できます。
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
