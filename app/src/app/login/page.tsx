'use client';

import Link from 'next/link';

import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage(): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Tiny top bar with logo */}
        <div className="mb-6 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 font-display text-[28px] leading-none text-ink">
            <span
              className="inline-block h-[18px] w-[18px] rounded-full border-2 border-ink bg-accent"
              style={{ transform: 'translateY(2px) rotate(-4deg)' }}
              aria-hidden="true"
            />
            <span>Sbobuz</span>
          </Link>
        </div>

        <div className="sk sk-wobble p-6">
          <div className="label-tiny mb-2">variant C {'\u00B7'} login</div>
          <h1 className="font-display text-3xl font-bold">Welcome back</h1>
          <div className="mt-4">
            <LoginForm />
          </div>
        </div>

        <p className="mt-5 text-center font-body text-sm text-ink-soft">
          New here?{' '}
          <Link href="/register" className="font-semibold text-ink underline underline-offset-2 hover:text-accent">
            create account
          </Link>
        </p>
      </div>
    </main>
  );
}
