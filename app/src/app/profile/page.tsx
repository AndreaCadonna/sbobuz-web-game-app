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
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink bg-accent-y font-display text-3xl font-bold">
          {user?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div>
          <h1 className="font-display text-4xl font-bold leading-none">
            {user?.displayName ?? 'Player'}
          </h1>
          <p className="mt-0.5 font-mono text-xs text-ink-soft">@{user?.username ?? ''}</p>
        </div>
      </div>

      <section className="mb-8" aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="label-tiny mb-2">statistics</h2>
        <PlayerStats />
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="label-tiny mb-2">match history</h2>
        <MatchHistory />
      </section>
    </div>
  );
}
