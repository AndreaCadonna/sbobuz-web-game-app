'use client';

import Link from 'next/link';

import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage(): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Sign In</h1>
          <p className="mt-2 text-[var(--color-muted)]">
            Welcome back to Sbobuz
          </p>
        </div>

        <LoginForm />

        <p className="text-center text-sm text-[var(--color-muted)]">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-medium text-brand-600 hover:text-brand-500"
          >
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
