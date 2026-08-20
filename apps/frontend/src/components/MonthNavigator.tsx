import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { nextYearMonth, previousYearMonth } from '@/lib/date';
import { cn } from '@/lib/utils';

/** 年月（YYYY-MM）を選択するUI。中央の月選択に加え、前後の月へ移動するボタンを両側に表示する。 */
export function MonthNavigator({
  value,
  onChange,
  min,
  max,
  className,
}: {
  value: string;
  onChange: (yearMonth: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  const prevMonth = previousYearMonth(value);
  const nextMonth = nextYearMonth(value);
  const canGoPrev = !min || prevMonth >= min;
  const canGoNext = !max || nextMonth <= max;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="前月"
        disabled={!canGoPrev}
        onClick={() => onChange(prevMonth)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Input
        type="month"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="w-40"
        aria-label="表示する年月"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="次月"
        disabled={!canGoNext}
        onClick={() => onChange(nextMonth)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
