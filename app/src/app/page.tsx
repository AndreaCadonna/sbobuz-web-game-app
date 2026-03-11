'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

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
      // The auth store will set the user, and the redirect above will fire
    },
    [guestName, guestLogin, isSubmitting],
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-50/40 via-transparent to-gold-50/30 dark:from-brand-950/30 dark:via-transparent dark:to-gold-950/20" aria-hidden="true" />
      <div className="absolute top-20 left-10 h-64 w-64 rounded-full bg-brand-200/20 blur-3xl dark:bg-brand-900/20" aria-hidden="true" />
      <div className="absolute bottom-20 right-10 h-48 w-48 rounded-full bg-gold-200/20 blur-3xl dark:bg-gold-900/20" aria-hidden="true" />

      <div className="relative max-w-2xl text-center">
        {/* Card suit decorations */}
        <div className="mb-6 flex items-center justify-center gap-3 text-2xl text-[var(--color-muted)]/40" aria-hidden="true">
          <span className="text-red-400/50">{'\u2665'}</span>
          <span className="text-[var(--color-muted)]/30">{'\u2660'}</span>
          <span className="text-red-400/50">{'\u2666'}</span>
          <span className="text-[var(--color-muted)]/30">{'\u2663'}</span>
        </div>

        <h1 className="font-display mb-4 text-6xl font-bold tracking-tight sm:text-7xl text-brand-800 dark:text-brand-300">
          Sbobuz
        </h1>
        <p className="mb-10 text-lg leading-relaxed text-[var(--color-muted)] max-w-md mx-auto">
          A turn-based card game for 2-5 players. Play with friends or challenge AI opponents.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-b from-gold-500 to-gold-600 px-8 text-base font-semibold text-brand-950 shadow-warm transition-all duration-200 hover:from-gold-400 hover:to-gold-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 active:scale-[0.97] motion-reduce:active:scale-100 sm:w-auto"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl border-2 border-[var(--color-border)] px-8 text-base font-semibold transition-all duration-200 hover:bg-[var(--color-card-bg)] hover:border-gold-400/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 active:scale-[0.97] motion-reduce:active:scale-100 sm:w-auto"
          >
            Create Account
          </Link>
        </div>

        {/* Guest mode section */}
        <div className="mt-8">
          {!showGuestForm ? (
            <button
              onClick={() => setShowGuestForm(true)}
              className="text-sm font-medium text-[var(--color-muted)] hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              or play as guest
            </button>
          ) : (
            <form
              onSubmit={(e) => { void handleGuestSubmit(e); }}
              className="mx-auto flex max-w-xs flex-col items-center gap-3 sm:max-w-sm sm:flex-row"
            >
              <input
                type="text"
                placeholder="Display name"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                minLength={2}
                maxLength={30}
                required
                autoFocus
                className="h-10 w-full rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400 sm:flex-1"
              />
              <button
                type="submit"
                disabled={isSubmitting || guestName.trim().length < 2}
                className="h-10 w-full rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
              >
                {isSubmitting ? 'Joining...' : 'Play'}
              </button>
            </form>
          )}
          {loginError && showGuestForm && (
            <p className="mt-2 text-sm text-red-500">{loginError}</p>
          )}
        </div>

        {/* How to Play link */}
        <div className="mt-10">
          <Link
            href="/how-to-play"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How to Play
          </Link>
        </div>
      </div>
    </main>
  );
}
