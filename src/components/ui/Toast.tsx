import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { spring } from '../../tokens/tokens';
import { useOverlayRoot } from './overlay';
import './toast.css';

interface ToastItem {
  id: number;
  message: string;
  tone: 'success' | 'neutral';
}

const ToastContext = createContext<(message: string, tone?: ToastItem['tone']) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);

  const show = useCallback((message: string, tone: ToastItem['tone'] = 'success') => {
    const id = next.current++;
    setItems((list) => [...list.slice(-1), { id, message, tone }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <ToastViewport items={items} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ items }: { items: ToastItem[] }) {
  const root = useOverlayRoot();
  if (!root) return null;
  return createPortal(
    <div className={`toasts ${root !== document.body ? 'toasts--frame' : ''}`} role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast toast--${t.tone}`}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={spring.snappy}
          >
            {t.tone === 'success' && (
              <span className="toast__icon" aria-hidden>
                <Check strokeWidth={3} />
              </span>
            )}
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    root,
  );
}
