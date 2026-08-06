import type { Transaction } from '@household/shared';

export type TransactionGroup = {
  date: string;
  transactions: Transaction[];
};

/**
 * 取引配列を date ごとにグルーピングする。グループの並び順は、その日付が配列内で
 * 最初に現れた位置を保つ（呼び出し側で日付降順にソート済みの配列を渡す想定）。
 */
export function groupTransactionsByDate(transactions: readonly Transaction[]): TransactionGroup[] {
  const groups: TransactionGroup[] = [];
  const groupByDate = new Map<string, TransactionGroup>();
  for (const tx of transactions) {
    let group = groupByDate.get(tx.date);
    if (!group) {
      group = { date: tx.date, transactions: [] };
      groupByDate.set(tx.date, group);
      groups.push(group);
    }
    group.transactions.push(tx);
  }
  return groups;
}
