/**
 * 金額表示用のフォーマッタ。グラフ・一覧など複数箇所で重複していた
 * `Intl.NumberFormat` インスタンス・目盛りフォーマットをここに集約する。
 */

const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

/** 円表示（¥1,234 形式）。 */
export function formatYen(value: number): string {
  return yenFormatter.format(value);
}

/** グラフのY軸目盛り用。1万円単位・小数第1位までに丸め、末尾の `.0` は省略する
 * （例: 0 → '0', 1500 → '0.2万', 15000 → '1.5万', 300000 → '30万'）。 */
export function formatManYenTick(value: number): string {
  const man = Math.round((value / 10000) * 10) / 10;
  if (man === 0) return '0';
  const text = man.toFixed(1);
  return `${text.endsWith('.0') ? text.slice(0, -2) : text}万`;
}
