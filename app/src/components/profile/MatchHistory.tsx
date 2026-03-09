/**
 * MatchHistory — Displays a paginated list of recent matches.
 *
 * Shows game results, rating changes, and timestamps.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { matchHistoryResponseSchema, type MatchHistoryEntry } from '@/lib/validators';

const PAGE_SIZE = 15;

type GameResult = 'win' | 'loss';

const RESULT_LABELS: Record<GameResult, { text: string; color: string }> = {
  win: { text: 'Win', color: 'text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 ring-1 ring-brand-200 dark:ring-brand-800' },
  loss: { text: 'Loss', color: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 ring-1 ring-red-200 dark:ring-red-800' },
};

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function MatchHistory(): React.JSX.Element {
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);

  const fetchHistory = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const raw = await api.getMatchHistory({ limit: PAGE_SIZE });
      const parsed = matchHistoryResponseSchema.parse(raw);
      setMatches(parsed.data.history);
      setHasNextPage(false);
      setHasPreviousPage(pageNum > 1);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to load match history';
      setError(message);
      logger.warn({ err }, 'Failed to fetch match history');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory(page);
  }, [page, fetchHistory]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <span className="text-sm font-medium text-[var(--color-muted)]">Loading history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center dark:bg-red-950/50 dark:border-red-800" role="alert">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => void fetchHistory(page)} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-[var(--color-border)] p-8 text-center">
        <p className="font-medium text-[var(--color-muted)]">No matches played yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {matches.map((match) => {
          const resultStyle = RESULT_LABELS[match.result];
          const ratingPrefix = match.ratingChange >= 0 ? '+' : '';

          return (
            <div
              key={match.gameId}
              className="flex flex-col gap-2 rounded-2xl border-2 border-[var(--color-border)] px-4 py-3 hover:bg-[var(--color-card-bg)] hover:border-gold-300/50 transition-all duration-200 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${resultStyle.color}`}>
                  {resultStyle.text}
                </span>
                <div className="text-sm">
                  <span className="text-[var(--color-muted)]">
                    Rating: <span className="font-semibold text-[var(--color-foreground)]">{String(match.ratingAfter)}</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span
                  className={`font-mono font-bold ${
                    match.ratingChange >= 0
                      ? 'text-brand-600 dark:text-brand-400'
                      : 'text-red-500 dark:text-red-400'
                  }`}
                >
                  {ratingPrefix}{String(match.ratingChange)}
                </span>
                <span className="text-xs font-medium text-[var(--color-muted)]">
                  {formatDate(match.playedAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {(hasPreviousPage || hasNextPage) && (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!hasPreviousPage}
          >
            Previous
          </Button>
          <span className="text-sm font-medium text-[var(--color-muted)]">Page {String(page)}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNextPage}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
