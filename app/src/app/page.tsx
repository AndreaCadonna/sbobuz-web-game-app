import Link from 'next/link';

export default function LandingPage(): React.JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="max-w-2xl text-center">
        <h1 className="mb-4 text-5xl font-bold tracking-tight">Sbobuz</h1>
        <p className="mb-8 text-lg text-[var(--color-muted)]">
          A turn-based card game for 2-5 players. Play with friends or challenge AI opponents.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-600 px-8 text-base font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-[var(--color-border)] px-8 text-base font-medium transition-colors hover:bg-[var(--color-card-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Create Account
          </Link>
        </div>
      </div>
    </main>
  );
}
