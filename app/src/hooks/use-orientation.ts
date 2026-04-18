/**
 * useOrientation — SSR-safe hook that returns the device orientation.
 *
 * 'portrait' when viewport height > width, 'landscape' otherwise.
 * Defaults to 'portrait' on the server to avoid hydration mismatches.
 */
'use client';

import { useEffect, useState } from 'react';

export type Orientation = 'portrait' | 'landscape';

function computeOrientation(): Orientation {
  return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
}

export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>('portrait');

  useEffect(() => {
    setOrientation(computeOrientation());

    const handler = (): void => {
      setOrientation(computeOrientation());
    };

    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
    };
  }, []);

  return orientation;
}
