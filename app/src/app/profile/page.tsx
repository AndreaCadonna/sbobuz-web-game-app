/**
 * Profile page — Displays player stats and match history.
 */
'use client';

import { MatchHistory } from '@/components/profile/MatchHistory';
import { PlayerStats } from '@/components/profile/PlayerStats';
import { useAuth } from '@/hooks/use-auth';

export default function ProfilePage(): React.JSX.Element {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Profile header */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
          {user?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{user?.displayName ?? 'Player'}</h1>
          <p className="text-sm text-[var(--color-muted)]">@{user?.username ?? ''}</p>
        </div>
      </div>

      {/* Stats */}
      <section className="mb-8" aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="mb-4 text-lg font-semibold">Statistics</h2>
        <PlayerStats />
      </section>

      {/* Match history */}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-4 text-lg font-semibold">Match History</h2>
        <MatchHistory />
      </section>
    </div>
  );
}
