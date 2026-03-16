/**
 * useViewportTier — SSR-safe hook that classifies the viewport into three tiers.
 *
 * - 'mobile': width < 640px (phone)
 * - 'compact': width < 1024px or height < 800px (tablet, small laptop)
 * - 'full': width >= 1024px and height >= 800px (large desktop)
 *
 * Uses both width and height to catch 14" laptops (e.g. 1366x768)
 * that are wide but vertically constrained.
 *
 * Defaults to 'full' on the server to avoid hydration mismatches.
 */
'use client';

import { useEffect, useState } from 'react';

export type ViewportTier = 'mobile' | 'compact' | 'full';

function computeTier(): ViewportTier {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w < 640) return 'mobile';
  if (w < 1024 || h < 800) return 'compact';
  return 'full';
}

export function useViewportTier(): ViewportTier {
  const [tier, setTier] = useState<ViewportTier>('full');

  useEffect(() => {
    setTier(computeTier());

    const handler = (): void => {
      setTier(computeTier());
    };

    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return tier;
}
