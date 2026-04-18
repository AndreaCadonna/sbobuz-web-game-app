'use client';

import Link from 'next/link';

import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterPage(): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
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
          <div className="label-tiny mb-2">variant B {'\u00B7'} register form</div>
          <h1 className="font-display text-3xl font-bold">Make an account</h1>
          <div className="mt-4">
            <RegisterForm />
          </div>
        </div>

        <p className="mt-5 text-center font-body text-sm text-ink-soft">
          Already have one?{' '}
          <Link href="/login" className="font-semibold text-ink underline underline-offset-2 hover:text-accent">
            log in
          </Link>
        </p>
      </div>
    </main>
  );
}
