import { useEffect, useState } from 'react';

/** `true` while the CSS media query matches (e.g. '(max-width: 720px)'); follows resizes / rotation. */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

/**
 * Spread on the image that is the page's LCP (largest visible element) so the browser fetches it before other
 * images. Lower-case on purpose: React 18 passes unknown lower-case attributes through without a warning.
 */
export const HIGH_PRIORITY = { fetchpriority: 'high' } as Record<string, string>;
