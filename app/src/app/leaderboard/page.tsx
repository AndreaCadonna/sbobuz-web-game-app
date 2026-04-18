/**
 * Leaderboard page — Top rankings display.
 */
'use client';

import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';

export default function LeaderboardPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="font-display text-4xl font-bold">Leaderboard</h1>
        <p className="mt-0.5 font-body text-sm text-ink-soft">Top ranked players</p>
      </div>

      <LeaderboardTable />
    </div>
  );
}
