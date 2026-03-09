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
  win: { text: 'Win', color: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950' },
  loss: { text: 'Loss', color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950' },
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
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <span className="ml-2 text-sm text-[var(--color-muted)]">Loading history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-center dark:bg-red-950" role="alert">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => void fetchHistory(page)} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] p-6 text-center">
        <p className="text-[var(--color-muted)]">No matches played yet.</p>
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
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-4 py-3 hover:bg-[var(--color-card-bg)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${resultStyle.color}`}>
                  {resultStyle.text}
                </span>
                <div className="text-sm">
                  <span className="text-[var(--color-muted)]">
                    Rating: {String(match.ratingAfter)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <span
                  className={`font-mono font-medium ${
                    match.ratingChange >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {ratingPrefix}{String(match.ratingChange)}
                </span>
                <span className="text-xs text-[var(--color-muted)]">
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
          <span className="text-sm text-[var(--color-muted)]">Page {String(page)}</span>
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
