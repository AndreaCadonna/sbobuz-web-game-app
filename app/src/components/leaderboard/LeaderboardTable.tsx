/**
 * LeaderboardTable — Displays top player rankings in a sortable table.
 *
 * Fetches leaderboard data from the API with pagination.
 * Highlights the current user's row.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { leaderboardResponseSchema, type LeaderboardEntry } from '@/lib/validators';
import { useAuthStore } from '@/stores/auth-store';

const PAGE_SIZE = 20;

export function LeaderboardTable(): React.JSX.Element {
  const userId = useAuthStore((s) => s.user?.id ?? '');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);

  const fetchLeaderboard = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const offset = (pageNum - 1) * PAGE_SIZE;
      const raw = await api.getLeaderboard({ limit: PAGE_SIZE, offset });
      const parsed = leaderboardResponseSchema.parse(raw);
      setEntries(parsed.data.entries);
      setHasNextPage(parsed.data.entries.length === PAGE_SIZE);
      setHasPreviousPage(pageNum > 1);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to load leaderboard';
      setError(message);
      logger.warn({ err }, 'Failed to fetch leaderboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeaderboard(page);
  }, [page, fetchLeaderboard]);

  const handleNextPage = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const handlePreviousPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <span className="text-sm font-medium text-[var(--color-muted)]">Loading rankings...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-8 text-center dark:bg-red-950/50 dark:border-red-800" role="alert">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void fetchLeaderboard(page)}
          className="mt-3"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-[var(--color-border)] p-12 text-center">
        <p className="font-medium text-[var(--color-muted)]">No rankings available yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--color-border)]">
        <table className="w-full text-sm" aria-label="Leaderboard rankings">
          <thead className="bg-[var(--color-card-bg)] text-left">
            <tr>
              <th scope="col" className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-[var(--color-muted)]">Rank</th>
              <th scope="col" className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-[var(--color-muted)]">Player</th>
              <th scope="col" className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-[var(--color-muted)] text-right">Rating</th>
              <th scope="col" className="hidden px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-[var(--color-muted)] text-right sm:table-cell">W</th>
              <th scope="col" className="hidden px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-[var(--color-muted)] text-right sm:table-cell">L</th>
              <th scope="col" className="hidden px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-[var(--color-muted)] text-right md:table-cell">Games</th>
              <th scope="col" className="px-4 py-3.5 font-bold text-xs uppercase tracking-wider text-[var(--color-muted)] text-right">Win %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {entries.map((entry) => {
              const isCurrentUser = entry.userId === userId;
              return (
                <tr
                  key={entry.userId}
                  className={`
                    transition-colors
                    ${isCurrentUser
                      ? 'bg-gold-50/60 dark:bg-gold-950/20 font-semibold'
                      : 'hover:bg-[var(--color-card-bg)]'}
                  `}
                >
                  <td className="px-4 py-3.5">
                    {entry.rank <= 3 ? (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 text-xs font-bold text-gold-950 shadow-sm dark:from-gold-600 dark:to-gold-800 dark:text-gold-100">
                        {String(entry.rank)}
                      </span>
                    ) : (
                      <span className="text-[var(--color-muted)] font-medium">{String(entry.rank)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="truncate max-w-[150px] block">
                      {entry.username}
                      {isCurrentUser && (
                        <span className="ml-1 text-xs font-bold text-brand-600 dark:text-brand-400">(you)</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold">{String(entry.rating)}</td>
                  <td className="hidden px-4 py-3.5 text-right sm:table-cell text-brand-600 dark:text-brand-400 font-semibold">
                    {String(entry.gamesWon)}
                  </td>
                  <td className="hidden px-4 py-3.5 text-right sm:table-cell text-red-500 dark:text-red-400 font-semibold">
                    {String(entry.gamesPlayed - entry.gamesWon)}
                  </td>
                  <td className="hidden px-4 py-3.5 text-right md:table-cell text-[var(--color-muted)]">
                    {String(entry.gamesPlayed)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold">
                    {String(Math.round(entry.winRate * 100))}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={handlePreviousPage}
          disabled={!hasPreviousPage}
        >
          Previous
        </Button>
        <span className="text-sm font-medium text-[var(--color-muted)]">Page {String(page)}</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleNextPage}
          disabled={!hasNextPage}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
