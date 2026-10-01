import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'pact.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const META_COLOR: Record<ResolvedTheme, string> = { light: '#F6F4EF', dark: '#0F1512' };

interface ThemeContextValue {
  /** What the person chose. */
  theme: Theme;
  /** What is actually painted: never `system`. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemPrefersDark = () => typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;

/** Mirrors the inline script in index.html: only the app is themed; marketing pages stay light. */
const isThemedPath = (path: string) => path === '/app' || path.startsWith('/app/');

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    setSystemDark(mq.matches);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Keep several tabs in step.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) setThemeState(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const painted: ResolvedTheme = isThemedPath(pathname) ? resolvedTheme : 'light';

  useEffect(() => {
    document.documentElement.dataset.theme = painted;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[painted]);
  }, [painted]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode: the choice still applies for this visit */
    }
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
