/**
 * Leaderboard page — Top rankings display.
 */
'use client';

import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';

export default function LeaderboardPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Top ranked players
        </p>
      </div>

      <LeaderboardTable />
    </div>
  );
}
