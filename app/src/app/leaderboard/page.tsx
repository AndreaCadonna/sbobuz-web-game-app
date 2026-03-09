/**
 * Leaderboard page — Top rankings display.
 */
'use client';

import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';

export default function LeaderboardPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">Leaderboard</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Top ranked players
        </p>
      </div>

      <LeaderboardTable />
    </div>
  );
}
