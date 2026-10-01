import { useEffect, useRef, type KeyboardEvent } from 'react';
import { PACT_TABS, tabLabel, type PactCounts, type PactTab } from '../../lib/lifecycle';
import './pact-tabs.css';

export const tabId = (t: PactTab) => `pacts-tab-${t}`;
export const PANEL_ID = 'pacts-panel';
const shown = (n: number) => (n > 999 ? '999+' : String(n));

interface Props {
  value: PactTab;
  onChange: (tab: PactTab) => void;
  /** Full counts per tab, not affected by search. Omit while loading: tabs then render disabled without numbers. */
  counts?: PactCounts;
}

/** Lifecycle tabs: a real tablist with roving focus, arrow keys, Home and End. Selecting follows focus. */
export function PactTabs({ value, onChange, counts }: Props) {
  const list = useRef<HTMLDivElement>(null);
  const disabled = !counts;
  // Keep the chosen tab in view when the row scrolls sideways (narrow phones, big counts, large text).
  useEffect(() => {
    const box = list.current;
    const tab = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!box || !tab) return;
    const pad = 20;
    if (tab.offsetLeft - pad < box.scrollLeft) box.scrollTo({ left: tab.offsetLeft - pad, behavior: 'smooth' });
    else if (tab.offsetLeft + tab.offsetWidth + pad > box.scrollLeft + box.clientWidth) box.scrollTo({ left: tab.offsetLeft + tab.offsetWidth + pad - box.clientWidth, behavior: 'smooth' });
  }, [value]);
  const move = (e: KeyboardEvent, i: number) => {
    const keys: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: PACT_TABS.length - 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const next = (keys[e.key] + PACT_TABS.length) % PACT_TABS.length;
    onChange(PACT_TABS[next]);
    (list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus();
  };
  return (
    <div ref={list} className="pact-tabs" role="tablist" aria-label="Pacts by status">
      {PACT_TABS.map((t, i) => {
        const on = t === value;
        return (
          <button
            key={t}
            id={tabId(t)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={PANEL_ID}
            disabled={disabled}
            tabIndex={on ? 0 : -1}
            className={`pact-tabs__tab ${on ? 'is-on' : ''}`}
            onClick={() => onChange(t)}
            onKeyDown={(e) => move(e, i)}
          >
            {tabLabel[t]}
            {counts && <span className="pact-tabs__count num"> · {shown(counts[t])}</span>}
          </button>
        );
      })}
    </div>
  );
}
