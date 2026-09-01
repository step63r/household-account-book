import { describe, expect, it } from 'vitest';
import { applyTransferDirection, transferDirectionOf } from './transferAmount';

describe('transferDirectionOf', () => {
  it('正の金額はdeposit（積立・入金）と判定する', () => {
    expect(transferDirectionOf(50000)).toBe('deposit');
  });

  it('負の金額はwithdrawal（解約・引き出し）と判定する', () => {
    expect(transferDirectionOf(-50000)).toBe('withdrawal');
  });

  it('0はdeposit扱いとする', () => {
    expect(transferDirectionOf(0)).toBe('deposit');
  });
});

describe('applyTransferDirection', () => {
  it('depositのときは絶対値をそのまま返す', () => {
    expect(applyTransferDirection(50000, 'deposit')).toBe(50000);
  });

  it('withdrawalのときは絶対値に負の符号を付与する', () => {
    expect(applyTransferDirection(50000, 'withdrawal')).toBe(-50000);
  });
});
