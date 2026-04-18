/**
 * LeaderboardTable — Sketchy rankings table.
 *
 * Paper bg with ink borders, uppercase mono column headers, Caveat numerals
 * for top-3 rank badges. Current user's row highlighted with paper-2 bg.
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
      const message = err instanceof ApiError ? err.message : 'Failed to load leaderboard';
      setError(message);
      logger.warn({ err }, 'Failed to fetch leaderboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeaderboard(page);
  }, [page, fetchLeaderboard]);

  const handleNextPage = useCallback(() => setPage((p) => p + 1), []);
  const handlePreviousPage = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-paper-2 border-t-ink" />
          <span className="font-body text-sm text-ink-soft">Loading rankings...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sk sk-alt border-accent text-center" role="alert">
        <p className="font-body text-sm font-semibold text-accent">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => void fetchLeaderboard(page)} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="sk sk-dashed p-12 text-center">
        <p className="font-display text-2xl">No rankings yet</p>
        <p className="mt-1 font-body text-sm text-ink-soft">Play some games to show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border-2 border-ink">
        <table className="w-full" aria-label="Leaderboard rankings">
          <thead className="border-b-2 border-ink bg-paper-2 font-mono">
            <tr className="text-left text-[11px] uppercase tracking-[1.5px] text-ink-soft">
              <th scope="col" className="px-3 py-2.5">Rank</th>
              <th scope="col" className="px-3 py-2.5">Player</th>
              <th scope="col" className="px-3 py-2.5 text-right">Rating</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right sm:table-cell">W</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right sm:table-cell">L</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right md:table-cell">Games</th>
              <th scope="col" className="px-3 py-2.5 text-right">Win %</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-dashed divide-line-soft font-body">
            {entries.map((entry) => {
              const isCurrentUser = entry.userId === userId;
              const topThree = entry.rank <= 3;
              return (
                <tr key={entry.userId} className={isCurrentUser ? 'bg-paper-2 font-bold' : 'hover:bg-paper-2/60'}>
                  <td className="px-3 py-3">
                    {topThree ? (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-accent-y font-display text-base font-bold">
                        {String(entry.rank)}
                      </span>
                    ) : (
                      <span className="font-display text-lg text-ink">{String(entry.rank)}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="block max-w-[180px] truncate">
                      {entry.username}
                      {isCurrentUser && <span className="ml-1 font-mono text-[10px] uppercase tracking-wider text-accent">(you)</span>}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-bold">{String(entry.rating)}</td>
                  <td className="hidden px-3 py-3 text-right font-semibold text-accent-2 sm:table-cell">{String(entry.gamesWon)}</td>
                  <td className="hidden px-3 py-3 text-right font-semibold text-accent sm:table-cell">{String(entry.gamesPlayed - entry.gamesWon)}</td>
                  <td className="hidden px-3 py-3 text-right text-ink-soft md:table-cell">{String(entry.gamesPlayed)}</td>
                  <td className="px-3 py-3 text-right font-semibold">{String(Math.round(entry.winRate * 100))}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={handlePreviousPage} disabled={!hasPreviousPage}>
          {'\u2039 '}previous
        </Button>
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">page {String(page)}</span>
        <Button variant="secondary" size="sm" onClick={handleNextPage} disabled={!hasNextPage}>
          next {'\u203A'}
        </Button>
      </div>
    </div>
  );
}
