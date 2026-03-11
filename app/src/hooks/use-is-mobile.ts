/**
 * useIsMobile — SSR-safe hook that returns true for viewports below the `sm` breakpoint (640px).
 *
 * Defaults to `false` on the server to avoid hydration mismatches.
 * Updates on mount and on window resize via matchMedia.
 */
'use client';

import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 639px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    setIsMobile(mql.matches);

    const handler = (e: MediaQueryListEvent): void => {
      setIsMobile(e.matches);
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
