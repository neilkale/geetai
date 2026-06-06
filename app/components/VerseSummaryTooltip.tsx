'use client';

import { useEffect, useState } from 'react';
import { useTouchMode } from './useTouchMode';

interface ActiveState {
  summary: string;
  ref: string;
}

export function VerseSummaryTooltip() {
  const isTouch = useTouchMode();
  const [active, setActive] = useState<ActiveState | null>(null);

  useEffect(() => {
    setActive(null);

    function pickFrom(el: HTMLElement | null): ActiveState | null {
      if (!el) return null;
      const summary = el.getAttribute('data-summary');
      const ref = el.getAttribute('data-verse-ref') || '';
      return summary ? { summary, ref } : null;
    }

    function onEvent(e: MouseEvent) {
      const target = (e.target as Element | null)?.closest?.(
        '[data-summary]',
      ) as HTMLElement | null;
      const next = pickFrom(target);
      setActive((prev) => {
        if (next && prev && next.summary === prev.summary) return prev;
        return next;
      });
    }

    function onLeave() {
      setActive(null);
    }

    const eventName = isTouch ? 'click' : 'mousemove';
    document.addEventListener(eventName, onEvent);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener(eventName, onEvent);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [isTouch]);

  if (!active) return null;

  return (
    <div className="tooltip" role="tooltip">
      <div className="tooltip-cat">verse</div>
      {active.ref && <div className="tooltip-head">{active.ref}</div>}
      <div className="tooltip-desc">{active.summary}</div>
    </div>
  );
}
