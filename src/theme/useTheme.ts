import { useContext } from 'react';
import { ThemeContext } from './ThemeProvider';

export type { Theme, ResolvedTheme } from './ThemeProvider';

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
