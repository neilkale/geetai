'use client';

import { useEffect, useRef, useState } from 'react';
import { glossary, type GlossaryEntry } from '@/lib/glossary';
import { useTouchMode } from './useTouchMode';

const byId = new Map(glossary.entries.map((e) => [e.id, e]));

function clearHighlights() {
  document.querySelectorAll('.gloss-active').forEach((el) => {
    el.classList.remove('gloss-active');
  });
}
function applyHighlights(id: string) {
  document
    .querySelectorAll(`[data-gloss="${CSS.escape(id)}"]`)
    .forEach((el) => el.classList.add('gloss-active'));
}

export function GlossaryTooltip() {
  const isTouch = useTouchMode();
  const [entry, setEntry] = useState<GlossaryEntry | null>(null);
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    setEntry(null);
    clearHighlights();
    lastIdRef.current = null;

    function onEvent(e: MouseEvent) {
      const target = (e.target as Element | null)?.closest?.('[data-gloss]') as
        | HTMLElement
        | null;
      if (target) {
        const id = target.getAttribute('data-gloss');
        if (!id) return;
        const found = byId.get(id);
        if (!found) return;
        if (lastIdRef.current !== id) {
          clearHighlights();
          applyHighlights(id);
          lastIdRef.current = id;
          setEntry(found);
        }
      } else if (lastIdRef.current !== null) {
        clearHighlights();
        lastIdRef.current = null;
        setEntry(null);
      }
    }

    function onLeave() {
      clearHighlights();
      lastIdRef.current = null;
      setEntry(null);
    }

    const eventName = isTouch ? 'click' : 'mousemove';
    document.addEventListener(eventName, onEvent);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener(eventName, onEvent);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [isTouch]);

  if (!entry) return null;

  return (
    <div className="tooltip" role="tooltip">
      <div className="tooltip-cat">{entry.category}</div>
      <div className="tooltip-head">
        {entry.primary_marathi}
        <span className="tooltip-roman">{entry.primary_roman}</span>
      </div>
      <div className="tooltip-desc">{entry.description}</div>
    </div>
  );
}
