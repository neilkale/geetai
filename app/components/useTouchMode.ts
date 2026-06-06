'use client';

import { useEffect, useState } from 'react';

/**
 * True when the device lacks hover (touch/mobile). Reactive to media-query
 * changes (e.g. plugging in a mouse).
 */
export function useTouchMode(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(hover: none)');
    setIsTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isTouch;
}
