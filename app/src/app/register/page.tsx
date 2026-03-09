'use client';

import Link from 'next/link';

import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterPage(): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="font-display text-3xl font-bold text-brand-700 dark:text-brand-400">
            Sbobuz
          </Link>
          <h1 className="mt-4 font-display text-2xl font-bold">Create Account</h1>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">
            Join Sbobuz and start playing
          </p>
        </div>

        <div className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 shadow-card">
          <RegisterForm />
        </div>

        <p className="text-center text-sm text-[var(--color-muted)]">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold text-brand-600 hover:text-brand-500 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
