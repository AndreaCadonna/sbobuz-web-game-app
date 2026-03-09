/**
 * PlayerStats — Displays player statistics summary.
 *
 * Shows rating, wins, losses, games played, and win rate
 * in a card grid layout.
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
      const message =
        err instanceof ApiError ? err.message : 'Failed to load stats';
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <span className="text-sm font-medium text-[var(--color-muted)]">Loading stats...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center dark:bg-red-950/50 dark:border-red-800" role="alert">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => void fetchStats()} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-2xl border-2 border-[var(--color-border)] p-8 text-center">
        <p className="font-medium text-[var(--color-muted)]">No stats available. Play some games!</p>
      </div>
    );
  }

  const statItems = [
    { label: 'Rank', value: `#${String(stats.rank)}`, color: '' },
    { label: 'Rating', value: String(stats.rating), color: 'text-gold-600 dark:text-gold-400' },
    { label: 'Wins', value: String(stats.gamesWon), color: 'text-brand-600 dark:text-brand-400' },
    { label: 'Losses', value: String(stats.gamesPlayed - stats.gamesWon), color: 'text-red-500 dark:text-red-400' },
    { label: 'Games', value: String(stats.gamesPlayed), color: '' },
    { label: 'Win Rate', value: `${String(Math.round(stats.winRate * 100))}%`, color: '' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Player statistics">
      {statItems.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-card-bg)] p-4 text-center transition-colors hover:border-gold-300/50"
        >
          <dt className="text-[10px] font-bold text-[var(--color-muted)] uppercase tracking-widest">
            {item.label}
          </dt>
          <dd className={`mt-1.5 font-display text-2xl font-bold ${item.color}`}>
            {item.value}
          </dd>
        </div>
      ))}
    </div>
  );
}
