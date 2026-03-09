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
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Profile header */}
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 text-2xl font-bold text-gold-950 shadow-warm dark:from-gold-600 dark:to-gold-800 dark:text-gold-100">
          {user?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold">{user?.displayName ?? 'Player'}</h1>
          <p className="text-sm font-medium text-[var(--color-muted)]">@{user?.username ?? ''}</p>
        </div>
      </div>

      {/* Stats */}
      <section className="mb-8" aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="font-display mb-4 text-xl font-bold">Statistics</h2>
        <PlayerStats />
      </section>

      {/* Match history */}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="font-display mb-4 text-xl font-bold">Match History</h2>
        <MatchHistory />
      </section>
    </div>
  );
}
