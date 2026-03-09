'use client';

import Link from 'next/link';

import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage(): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="font-display text-3xl font-bold text-brand-700 dark:text-brand-400">
            Sbobuz
          </Link>
          <h1 className="mt-4 font-display text-2xl font-bold">Welcome Back</h1>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">
            Sign in to continue playing
          </p>
        </div>

        <div className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 shadow-card">
          <LoginForm />
        </div>

        <p className="text-center text-sm text-[var(--color-muted)]">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-semibold text-brand-600 hover:text-brand-500 transition-colors"
          >
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
