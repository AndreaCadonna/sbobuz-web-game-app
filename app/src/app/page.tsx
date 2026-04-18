'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/use-auth';

export default function LandingPage(): React.JSX.Element {
  const router = useRouter();
  const { guestLogin, loginError, isAuthenticated } = useAuth();
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  if (isAuthenticated) {
    router.replace('/lobby');
  }

  const handleGuestSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault();
      if (!guestName.trim() || isSubmitting) return;
      setIsSubmitting(true);
      await guestLogin(guestName.trim());
      setIsSubmitting(false);
    },
    [guestName, guestLogin, isSubmitting],
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Tiny header: logo + tagline */}
        <div className="mb-10 flex items-center gap-3">
          <span
            className="inline-block h-[18px] w-[18px] rounded-full border-2 border-ink bg-accent"
            style={{ transform: 'translateY(2px) rotate(-4deg)' }}
            aria-hidden="true"
          />
          <span className="font-display text-[28px] leading-none">Sbobuz</span>
          <span className="font-body text-sm italic text-ink-soft">a card game</span>
        </div>

        {/* Hero — Variant A wording */}
        <h1 className="font-display text-6xl leading-none sm:text-7xl">
          Sbobuz.
          <br />
          <span className="text-accent">play the</span> pile.
        </h1>
        <p className="mt-5 max-w-md font-body text-lg text-ink-soft">
          A turn-based card race. 2&ndash;5 players. Bots optional. Free to join.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/register">
            <Button variant="primary" size="lg">
              Create account {'\u25B8'}
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="ghost" size="lg">
              Log in
            </Button>
          </Link>
        </div>

        {/* Guest mode */}
        <div className="mt-7">
          {!showGuestForm ? (
            <button
              onClick={() => setShowGuestForm(true)}
              className="font-body text-sm text-ink-soft underline-offset-2 hover:text-ink hover:underline"
            >
              or play as guest
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                void handleGuestSubmit(e);
              }}
              className="flex max-w-sm flex-col items-stretch gap-3 sm:flex-row sm:items-center"
            >
              <input
                type="text"
                placeholder="display name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                minLength={2}
                maxLength={30}
                required
                autoFocus
                className="h-10 w-full rounded-md border-2 border-ink bg-paper px-3 font-body text-base placeholder:italic placeholder:text-line-soft focus:outline-none focus:ring-2 focus:ring-accent-3 sm:flex-1"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting || guestName.trim().length < 2}
                isLoading={isSubmitting}
              >
                Play
              </Button>
            </form>
          )}
          {loginError && showGuestForm && (
            <p className="mt-2 font-body text-sm text-accent">{loginError}</p>
          )}
        </div>

        {/* Mono link row at bottom */}
        <div className="mt-14 flex flex-wrap items-center gap-3 font-mono text-xs text-line-soft">
          <span>{'\u2022'}</span>
          <Link href="/how-to-play" className="hover:text-ink">rules</Link>
          <span>{'\u00B7'}</span>
          <Link href="/how-to-play" className="hover:text-ink">how to play</Link>
          <span>{'\u00B7'}</span>
          <Link href="/leaderboard" className="hover:text-ink">leaderboard</Link>
          <span>{'\u2192'}</span>
        </div>
      </div>
    </main>
  );
}
