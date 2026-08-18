import { RefObject, useEffect } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onDoubleTap?: () => void;
  horizontalThreshold?: number;
  verticalThreshold?: number;
}

export function useSwipeGesture(
  ref: RefObject<HTMLElement | null>,
  options: SwipeOptions,
  enabled = true,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !window.matchMedia('(pointer: coarse)').matches) return;

    const { horizontalThreshold = 40, verticalThreshold = 70 } = options;

    let startX = 0, startY = 0, startTime = 0;
    let lastTapTime = 0, lastTapX = 0, lastTapY = 0;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    };

    const onTouchEnd = (e: TouchEvent) => {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - startX;
      const dy = endY - startY;
      const dt = Date.now() - startTime;

      // Double-tap detection
      if (options.onDoubleTap) {
        const now = Date.now();
        const tapDx = Math.abs(endX - lastTapX);
        const tapDy = Math.abs(endY - lastTapY);
        if (now - lastTapTime < 300 && tapDx < 30 && tapDy < 30 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
          options.onDoubleTap();
          lastTapTime = 0;
          return;
        }
        lastTapTime = now;
        lastTapX = endX;
        lastTapY = endY;
      }

      if (dt > 500) return; // too slow — probably a long-press or scroll

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // Horizontal swipe: x dominant and above threshold
      if (absX > horizontalThreshold && absX > absY * 1.5) {
        if (dx < 0) options.onSwipeLeft?.();
        else options.onSwipeRight?.();
        return;
      }

      // Vertical swipe: y dominant and above threshold
      if (absY > verticalThreshold && absY > absX * 1.5) {
        // Only fire vertical swipe if at scroll boundary
        const atTop = el.scrollTop <= 2;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
        if (dy < 0 && atBottom) options.onSwipeUp?.();
        else if (dy > 0 && atTop) options.onSwipeDown?.();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [ref, enabled, options]);
}
