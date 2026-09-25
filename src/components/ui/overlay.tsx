import { createContext, useContext } from 'react';

/**
 * Where modals and toasts portal to. The prototype sets this to the phone
 * frame so sheets stay inside the device; everywhere else it's <body>.
 */
export const OverlayRootContext = createContext<HTMLElement | null>(null);
export const useOverlayRoot = () => useContext(OverlayRootContext) ?? (typeof document !== 'undefined' ? document.body : null);
