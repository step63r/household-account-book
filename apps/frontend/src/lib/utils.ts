import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 安定した参照を持つ空配列。`data ?? []` が毎レンダー新しい配列を作り
 * useMemo の依存配列を壊すのを避けるために使う。 */
export const EMPTY_ARRAY: readonly never[] = [];
