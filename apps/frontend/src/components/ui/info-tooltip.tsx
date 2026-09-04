import * as React from 'react';
import { Info } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function InfoTooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('text-muted-foreground hover:text-foreground', className)}
          aria-label={label}
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="bg-primary text-primary-foreground w-auto max-w-64 rounded-md border-none px-3 py-1.5 text-xs text-balance shadow-md"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export { InfoTooltip };
