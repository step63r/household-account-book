import { describe, expect, it } from 'vitest';
import { formatManYenTick } from './format';

describe('formatManYenTick', () => {
  it('0 は "0" を返す（"0万" にはしない）', () => {
    expect(formatManYenTick(0)).toBe('0');
  });

  it('1万円未満の値は小数第1位まで丸めて表示する', () => {
    expect(formatManYenTick(1500)).toBe('0.2万');
  });

  it('端数のある値は小数第1位に丸める', () => {
    expect(formatManYenTick(15000)).toBe('1.5万');
  });

  it('1万円ちょうどの倍数は末尾の .0 を省略する', () => {
    expect(formatManYenTick(300000)).toBe('30万');
    expect(formatManYenTick(10000)).toBe('1万');
  });

  it('負の値は符号を保ったまま表示する', () => {
    expect(formatManYenTick(-15000)).toBe('-1.5万');
    expect(formatManYenTick(-300000)).toBe('-30万');
  });
});
