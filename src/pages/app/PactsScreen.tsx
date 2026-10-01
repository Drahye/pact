import { Plus, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../api/auth';
import { usePacts } from '../../api/hooks';
import { Empty, ErrorState, Notice } from '../../components/app/States';
import { PactListSkeleton } from '../../components/app/Skeleton';
import { PactCard } from '../../components/pact/PactCard';
import { PactTabs, PANEL_ID, tabId } from '../../components/pact/PactTabs';
import { BottomNav } from '../../components/ui/BottomNav';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import type { Pact } from '../../data/types';
import { countByTab, defaultTab, lifecycleOf, matchesTitle, MAX_SEARCH, normalizeQuery, readView, sortForTab, tabLabel, writeView, type Lifecycle, type PactTab } from '../../lib/lifecycle';
import { attentionFor } from '../../lib/plan';
import { Screen } from './Screen';
import './pacts-screen.css';

const SCROLL_KEY = 'pact.pactsScroll';

const emptyCopy: Record<Lifecycle, string> = {
  active: 'No active Pacts right now.',
  completed: 'Nothing completed yet.',
  closed: 'No closed Pacts.',
};

/**
 * Your Pacts by where they are in their life: Active (including funded Pacts still waiting for their
 * money to be released), Completed (released) and Closed (cancelled or refunded).
 *
 * Behaviour worth knowing:
 * - Search matches Pact titles only, ignores case and repeated spaces, runs in the browser, and is
 *   capped at 60 characters. The query stays when you switch tabs, so one name can be found across
 *   states. Tab, query and scroll position are remembered for the browser session, so Back from a
 *   Pact returns to the same view.
 * - Counts in the tabs are for the whole tab, never the filtered result.
 * - A selected tab never changes by itself. If its last Pact moves elsewhere you see that tab's empty state.
 */
export function PactsScreen() {
  const { user } = useAuth();
  const pacts = usePacts();
  const initial = useRef(readView()).current;
  const [tabPref, setTabPref] = useState<PactTab | null>(initial.tab);
  const [query, setQuery] = useState(initial.query);
  const root = useRef<HTMLDivElement>(null);

  // Offline, react-query pauses the request instead of failing it: say so, never show "No Pacts".
  const paused = pacts.fetchStatus === 'paused';
  const failed = (pacts.isError || paused) && !pacts.data;
  // While a failed load is being retried, show the loading state again rather than the old error.
  const loading = pacts.isLoading || (failed && pacts.isFetching);
  const refreshFailed = pacts.isError && !!pacts.data;
  const offlineWithData = paused && !!pacts.data;

  // Only Pacts you have joined, once each, whatever the server sends.
  const mine = useMemo(() => {
    const seen = new Map<string, Pact>();
    for (const p of pacts.data ?? []) if (p.viewer?.status === 'joined') seen.set(p.id, p);
    return [...seen.values()];
  }, [pacts.data]);
  const counts = useMemo(() => countByTab(mine), [mine]);
  const tab: PactTab = tabPref ?? defaultTab();
  // The first tab is chosen once, when Pacts first appear. After that it only changes when the person changes it,
  // even if its last Pact moves elsewhere.
  useEffect(() => {
    if (tabPref === null && !loading && !failed && mine.length > 0) setTabPref(defaultTab());
  }, [tabPref, loading, failed, mine.length, counts]);
  const nq = normalizeQuery(query);

  const tabItems = useMemo(() => mine.filter((p) => tab === 'all' || lifecycleOf(p) === tab), [mine, tab]);
  const shown = useMemo(() => sortForTab(tabItems.filter((p) => matchesTitle(p, nq))), [tabItems, nq, tab]);

  // One line of what each active Pact needs from you. A Pact that can't produce one just has no line.
  const attention = useMemo(() => {
    const out = new Map<string, string>();
    for (const p of shown) {
      if (p.status !== 'open' || !user) continue;
      try {
        const first = attentionFor(p, user.id)[0];
        if (first?.title) out.set(p.id, first.title);
      } catch {
        /* skip it */
      }
    }
    return out;
  }, [shown, user]);

  useEffect(() => writeView({ tab: tabPref, query }), [tabPref, query]);

  // Back from a Pact lands where you were. The scroll position is saved as you go and restored once, when the list first appears.
  useEffect(() => {
    const el = root.current?.closest('.screen__content');
    if (!el) return;
    let raf = 0;
    const save = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop));
        } catch {
          /* ignore */
        }
      });
    };
    el.addEventListener('scroll', save, { passive: true });
    return () => {
      el.removeEventListener('scroll', save);
      cancelAnimationFrame(raf);
    };
  }, []);
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || loading || !mine.length) return;
    restored.current = true;
    try {
      const y = Number(sessionStorage.getItem(SCROLL_KEY));
      const el = root.current?.closest('.screen__content');
      if (el && Number.isFinite(y) && y > 0) el.scrollTop = y;
    } catch {
      /* ignore */
    }
  }, [loading, mine.length]);

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const clear = () => setQuery('');

  let body: React.ReactNode;
  if (loading) {
    body = <PactListSkeleton label="Loading your Pacts" />;
  } else if (failed) {
    body = <ErrorState message={offline || paused ? 'You’re offline. Reconnect and try again.' : undefined} onRetry={() => void pacts.refetch()} />;
  } else if (!mine.length) {
    body = (
      <Empty
        icon={<Plus />}
        title="No Pacts yet"
        body="Start one for a trip, a gift or a shared bill, or join with an invite link."
        action={<Button to="/app/create">Create a Pact</Button>}
      />
    );
  } else if (!tabItems.length) {
    body = <Empty icon={<Search />} title={tab === 'all' ? 'No Pacts yet' : emptyCopy[tab as Lifecycle]} body={tab === 'active' ? 'Start one, or join with an invite link.' : 'They’ll show up here.'} />;
  } else if (!shown.length) {
    body = (
      <Empty
        icon={<Search />}
        title={`No Pacts match “${query.replace(/\s+/g, ' ').trim()}”.`}
        body={`Searching ${tabLabel[tab]} Pacts by name.`}
        action={
          <Button variant="secondary" onClick={clear}>
            Clear search
          </Button>
        }
      />
    );
  } else {
    body = (
      <div className="list-stack">
        {shown.map((p) => (
          <PactCard key={p.id} pact={p} to={`/app/pact/${p.id}`} attention={attention.get(p.id)} />
        ))}
      </div>
    );
  }

  const showControls = pacts.isLoading || (!failed && mine.length > 0);
  const announce = loading || failed || !mine.length ? '' : nq ? `${shown.length} of ${tabItems.length} ${tabLabel[tab]} Pacts match` : `${tabItems.length} ${tabLabel[tab]} Pacts`;

  return (
    <Screen tabBar={<BottomNav />}>
      <div className="screen-title-row">
        <h1 className="large-title">Pacts</h1>
        <IconButton label="Create a Pact" icon={<Plus />} to="/app/create" />
      </div>
      <div ref={root} aria-busy={loading || pacts.isFetching ? true : undefined}>
        {showControls && (
          <>
            <PactTabs value={tab} onChange={setTabPref} counts={loading ? undefined : counts} />
            <div className="pacts-search">
              <Search aria-hidden />
              <input
                type="search"
                aria-label="Search Pacts by name"
                placeholder="Search by name"
                value={query}
                maxLength={MAX_SEARCH}
                disabled={loading}
                autoComplete="off"
                enterKeyHint="search"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && clear()}
              />
              {query && (
                <button type="button" className="pacts-search__clear" aria-label="Clear search" onClick={clear}>
                  <X />
                </button>
              )}
            </div>
          </>
        )}
        {offlineWithData && !refreshFailed && (
          <div className="pacts-notice" role="status">
            <Notice tone="sun">You’re offline. This is the last list we loaded.</Notice>
          </div>
        )}
        {refreshFailed && (
          <div className="pacts-notice">
            <Notice tone="sun">
              Couldn’t refresh your Pacts, so this may be out of date.{' '}
              <button type="button" className="link" onClick={() => void pacts.refetch()}>
                Try again
              </button>
            </Notice>
          </div>
        )}
        <p className="visually-hidden" role="status" aria-live="polite">
          {announce}
        </p>
        <div id={PANEL_ID} role={showControls && !loading ? 'tabpanel' : undefined} aria-labelledby={showControls && !loading ? tabId(tab) : undefined} className="pacts-panel">
          {body}
        </div>
      </div>
    </Screen>
  );
}
