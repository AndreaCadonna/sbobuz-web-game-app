/**
 * MatchHistory — Sketchy list of recent matches.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { matchHistoryResponseSchema, type MatchHistoryEntry } from '@/lib/validators';

const PAGE_SIZE = 15;

type GameResult = 'win' | 'loss';

const RESULT_PILL: Record<GameResult, { text: string; pill: string }> = {
  win: { text: 'win', pill: 'pill green' },
  loss: { text: 'loss', pill: 'pill accent' },
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
      const message = err instanceof ApiError ? err.message : 'Failed to load match history';
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-paper-2 border-t-ink" />
          <span className="font-body text-sm text-ink-soft">Loading history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sk sk-alt border-accent text-center" role="alert">
        <p className="font-body text-sm font-semibold text-accent">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => void fetchHistory(page)} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="sk sk-dashed p-8 text-center">
        <p className="font-body text-ink-soft">No matches played yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {matches.map((match) => {
          const resultStyle = RESULT_PILL[match.result];
          const ratingPrefix = match.ratingChange >= 0 ? '+' : '';
          const ratingColor = match.ratingChange >= 0 ? 'text-accent-2' : 'text-accent';
          return (
            <div
              key={match.gameId}
              className="flex flex-col gap-2 rounded-md border-2 border-ink bg-paper px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className={resultStyle.pill}>{resultStyle.text}</span>
                <div className="font-body text-sm">
                  <span className="text-ink-soft">rating: </span>
                  <span className="font-bold">{String(match.ratingAfter)}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`font-mono text-sm font-bold ${ratingColor}`}>
                  {ratingPrefix}
                  {String(match.ratingChange)}
                </span>
                <span className="font-mono text-[11px] text-line-soft">{formatDate(match.playedAt)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {(hasPreviousPage || hasNextPage) && (
        <div className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!hasPreviousPage}
          >
            {'\u2039 '}previous
          </Button>
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">page {String(page)}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNextPage}
          >
            next {'\u203A'}
          </Button>
        </div>
      )}
    </div>
  );
}
