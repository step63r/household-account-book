import * as React from 'react';

import { Input } from '@/components/ui/input';

/** 全角数字（０-９）を半角（0-9）に変換する */
function toHalfWidthDigits(value: string): string {
  return value.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** 数字以外を除去し、先頭の余分な0を丸める（例: "０５" -> "5", "00" -> "0"） */
function sanitizeDigits(rawValue: string): string {
  const digitsOnly = toHalfWidthDigits(rawValue).replace(/[^0-9]/g, '');
  return digitsOnly.replace(/^0+(?=\d)/, '');
}

export interface AmountInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> {
  /** 空欄はNaNで表す（RHFのfield.valueがnumber型のため、undefinedではなくNaNを空欄の番兵値として使う） */
  value: number;
  onChange: (value: number) => void;
}

/**
 * 円額などの非負整数を入力するテキスト入力。
 * type="number"ではなくtype="text"+inputMode="numeric"を用い、スピナーUIやホイール操作による
 * 誤変更を避けつつモバイルでは数字キーパッドを開く。空欄への変更を許可するためNaNを空欄として扱う。
 */
function AmountInput({ value, onChange, ...rest }: AmountInputProps) {
  const display = Number.isNaN(value) ? '' : String(value);

  return (
    <Input
      {...rest}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={display}
      onChange={(e) => {
        const digits = sanitizeDigits(e.target.value);
        onChange(digits === '' ? NaN : Number(digits));
      }}
    />
  );
}

export { AmountInput };
