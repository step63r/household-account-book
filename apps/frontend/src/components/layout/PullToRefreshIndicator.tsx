import { ArrowDown, RefreshCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { PullToRefreshState } from '@/hooks/usePullToRefresh';

export function PullToRefreshIndicator({
  pullDistance,
  progress,
  isRefreshing,
}: PullToRefreshState) {
  const visible = pullDistance > 0 || isRefreshing;
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center overflow-hidden transition-opacity md:hidden',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      style={{ height: pullDistance }}
    >
      <div className="flex items-end justify-center pb-2">
        {isRefreshing ? (
          <RefreshCw className="size-5 animate-spin text-primary" />
        ) : (
          <ArrowDown
            className="size-5 text-muted-foreground transition-transform"
            style={{ transform: `rotate(${progress * 180}deg)` }}
          />
        )}
      </div>
    </div>
  );
}
