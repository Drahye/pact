import { useEffect, useState } from 'react';

const cache = new Map<string, string>();

/** The average colour of a picture, as a CSS colour. Drawn to a 1x1 canvas, so it costs nothing; same-origin and object URLs only (anything else stays transparent). */
function average(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve('transparent');
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        resolve(`rgb(${r} ${g} ${b})`);
      } catch {
        resolve('transparent');
      }
    };
    img.onerror = () => resolve('transparent');
    img.src = src;
  });
}

/** `style` to spread on a surface that wears a photograph: sets --photo-tone to the photograph's own average colour. */
export function usePhotoTone(src?: string | null): Record<string, string> | undefined {
  const [tone, setTone] = useState<string | undefined>(src ? cache.get(src) : undefined);
  useEffect(() => {
    if (!src) return setTone(undefined);
    const hit = cache.get(src);
    if (hit) return setTone(hit);
    let live = true;
    average(src).then((t) => {
      cache.set(src, t);
      if (live) setTone(t);
    });
    return () => {
      live = false;
    };
  }, [src]);
  return tone ? { '--photo-tone': tone } : undefined;
}
