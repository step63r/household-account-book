import { useEffect, useRef, useState } from 'react';

const MAX_PULL_PX = 96;
const TRIGGER_PX = 64;
const RESISTANCE = 0.5;
const MIN_SPINNER_MS = 500;
const DEAD_ZONE_PX = 5;

export type PullToRefreshState = {
  pullDistance: number;
  progress: number;
  isRefreshing: boolean;
};

/**
 * PWAをiOS Safariのホーム画面から起動した standalone モードでは
 * ブラウザ純正のpull-to-refreshが使えないため、独自にジェスチャーを実装する。
 * Dialog/Sheet/Popover はすべて Radix Portal 経由で containerRef の外にレンダリングされるため、
 * リスナーを containerRef にスコープすることでモーダル操作との干渉を避けている（別途の開閉判定は不要）。
 */
export function usePullToRefresh(
  onRefresh: () => Promise<unknown>,
  containerRef: React.RefObject<HTMLElement | null>,
  disabled = false,
): PullToRefreshState {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const trackingRef = useRef(false);
  const startYRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return;
      if (window.scrollY > 0) return;
      const touch = e.touches[0];
      if (!touch) return;
      trackingRef.current = false;
      startYRef.current = touch.clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (refreshingRef.current) return;
      if (window.scrollY > 0) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dy = touch.clientY - startYRef.current;
      if (!trackingRef.current) {
        if (dy > DEAD_ZONE_PX) {
          trackingRef.current = true;
        } else {
          return;
        }
      }
      if (dy <= 0) {
        trackingRef.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }
      e.preventDefault();
      const damped = Math.min(dy * RESISTANCE, MAX_PULL_PX);
      pullDistanceRef.current = damped;
      setPullDistance(damped);
    }

    async function onTouchEnd() {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      const committed = pullDistanceRef.current >= TRIGGER_PX * RESISTANCE;
      if (!committed) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }
      refreshingRef.current = true;
      setIsRefreshing(true);
      const heldDistance = TRIGGER_PX * RESISTANCE;
      pullDistanceRef.current = heldDistance;
      setPullDistance(heldDistance);
      const startedAt = Date.now();
      try {
        await onRefreshRef.current();
      } finally {
        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, MIN_SPINNER_MS - elapsed);
        setTimeout(() => {
          refreshingRef.current = false;
          setIsRefreshing(false);
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }, wait);
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [containerRef, disabled]);

  return {
    pullDistance,
    progress: Math.min(pullDistance / (TRIGGER_PX * RESISTANCE), 1),
    isRefreshing,
  };
}
