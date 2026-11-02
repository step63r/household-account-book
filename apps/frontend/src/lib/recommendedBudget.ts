import type { Transaction } from '@household/shared';

/**
 * サブスクリプションの推奨予算を返す。過去の支出取引のうち、費目と摘要（名前）が一致するものの
 * 平均額を10円単位に切り上げた値。該当する取引が1件も無い場合は null。
 *
 * 平均は「月数」ではなく「取引件数」で割る（1か月に同名の取引が複数あればそれぞれ1件として数える）。
 * 摘要はサブスクリプションの取引サジェスト（TransactionsPage）が名前をそのまま入れるため、
 * 名前の完全一致（前後の空白は無視）で同一サブスクの取引とみなす。
 */
export function recommendedSubscriptionBudget(
  transactions: readonly Transaction[],
  target: { name: string; categoryId: string },
): number | null {
  const name = target.name.trim();
  if (!name || !target.categoryId) return null;

  const matched = transactions.filter(
    (tx) =>
      tx.type === 'expense' && tx.categoryId === target.categoryId && tx.memo?.trim() === name,
  );
  if (matched.length === 0) return null;

  const total = matched.reduce((sum, tx) => sum + tx.amount, 0);
  // 平均を先に求めると浮動小数点誤差で10円ちょうどの平均が切り上がり得るため、除算は1回にまとめる
  return Math.ceil(total / (matched.length * 10)) * 10;
}
