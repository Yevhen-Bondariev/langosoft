import { useCallback, useRef } from 'react';

export function useLongPress(callback: () => void, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedRef = useRef(false);

  const start = useCallback((e: React.TouchEvent) => {
    movedRef.current = false;
    timerRef.current = setTimeout(() => {
      if (!movedRef.current) callback();
    }, delay);
    // Suppress context menu on long-press
    e.preventDefault();
  }, [callback, delay]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const move = useCallback(() => {
    movedRef.current = true;
    cancel();
  }, [cancel]);

  return { onTouchStart: start, onTouchEnd: cancel, onTouchMove: move };
}
