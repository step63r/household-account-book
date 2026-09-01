/** 振替（transfer）取引の入力方向。金額の符号をUI上の選択に変換するための型。 */
export type TransferDirection = 'deposit' | 'withdrawal';

/** 振替金額の符号から方向を判定する（負=解約・引き出し、それ以外=積立・入金）。 */
export function transferDirectionOf(amount: number): TransferDirection {
  return amount < 0 ? 'withdrawal' : 'deposit';
}

/** ユーザーがAmountInputに入力した絶対値の金額に、選択された方向に応じた符号を付与する。 */
export function applyTransferDirection(absAmount: number, direction: TransferDirection): number {
  return direction === 'withdrawal' ? -absAmount : absAmount;
}
