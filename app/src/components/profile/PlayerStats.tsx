/**
 * PlayerStats — Sketchy stat cards.
 *
 * Grid of stat tiles, each a small `sk` box with a tiny mono label and a
 * big Caveat number.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { myRatingResponseSchema, type LeaderboardEntry } from '@/lib/validators';

export function PlayerStats(): React.JSX.Element {
  const [stats, setStats] = useState<LeaderboardEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const raw = await api.getMyRating();
      const parsed = myRatingResponseSchema.parse(raw);
      setStats(parsed.data.entry);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load stats';
      setError(message);
      logger.warn({ err }, 'Failed to fetch player stats');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-paper-2 border-t-ink" />
          <span className="font-body text-sm text-ink-soft">Loading stats...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sk sk-alt border-accent text-center" role="alert">
        <p className="font-body text-sm font-semibold text-accent">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => void fetchStats()} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="sk sk-dashed p-8 text-center">
        <p className="font-body text-ink-soft">No stats available. Play some games!</p>
      </div>
    );
  }

  const statItems: { label: string; value: string; color?: string }[] = [
    { label: 'rank', value: `#${String(stats.rank)}` },
    { label: 'rating', value: String(stats.rating), color: 'text-accent-y' },
    { label: 'wins', value: String(stats.gamesWon), color: 'text-accent-2' },
    { label: 'losses', value: String(stats.gamesPlayed - stats.gamesWon), color: 'text-accent' },
    { label: 'games', value: String(stats.gamesPlayed) },
    { label: 'win rate', value: `${String(Math.round(stats.winRate * 100))}%` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Player statistics">
      {statItems.map((item) => (
        <div key={item.label} className="sk text-center">
          <dt className="label-tiny">{item.label}</dt>
          <dd className={`mt-1 font-display text-3xl font-bold ${item.color ?? 'text-ink'}`}>
            {item.value}
          </dd>
        </div>
      ))}
    </div>
  );
}
