/**
 * AppHeader — Top navigation bar with nav links, user info, and connection status.
 *
 * Desktop: horizontal nav links. Mobile: hamburger menu.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { ConnectionStatus } from '@/components/ui/ConnectionStatus';
import { useAuth } from '@/hooks/use-auth';

const ALL_NAV_LINKS = [
  { href: '/lobby', label: 'Lobby', guestVisible: true },
  { href: '/leaderboard', label: 'Leaderboard', guestVisible: false },
  { href: '/profile', label: 'Profile', guestVisible: false },
  { href: '/how-to-play', label: 'How to Play', guestVisible: true },
] as const;

export function AppHeader(): React.JSX.Element {
  const { user, isGuest, logout } = useAuth();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = useMemo(
    () => ALL_NAV_LINKS.filter((link) => !isGuest || link.guestVisible),
    [isGuest],
  );

  const handleLogout = useCallback((): void => {
    void logout();
  }, [logout]);

  const toggleMobileMenu = useCallback((): void => {
    setIsMobileMenuOpen((prev) => !prev);
  }, []);

  const closeMobileMenu = useCallback((): void => {
    setIsMobileMenuOpen(false);
  }, []);

  return (
    <header className="border-b-2 border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur-sm sticky top-0 z-40">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Left: logo and desktop nav */}
        <div className="flex items-center gap-8">
          <Link href="/lobby" className="font-display text-xl font-bold tracking-tight text-brand-700 dark:text-brand-400" onClick={closeMobileMenu}>
            Sbobuz
          </Link>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200
                    ${isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                      : 'text-[var(--color-muted)] hover:bg-[var(--color-card-bg)] hover:text-[var(--color-foreground)]'}
                  `}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: connection status, user info, mobile menu button */}
        <div className="flex items-center gap-4">
          <ConnectionStatus />

          {/* Desktop user info */}
          {user && (
            <div className="hidden items-center gap-3 sm:flex">
              <Link
                href={isGuest ? '/lobby' : '/profile'}
                className="flex items-center gap-2 text-sm font-medium hover:text-brand-600 transition-colors"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-100 text-xs font-bold text-gold-800 dark:bg-gold-900 dark:text-gold-200">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden lg:inline">{user.displayName}</span>
                {isGuest && (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                    Guest
                  </span>
                )}
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-lg px-2 py-1 text-sm text-[var(--color-muted)] transition-colors hover:bg-[var(--color-card-bg)] hover:text-[var(--color-foreground)]"
              >
                {isGuest ? 'Exit' : 'Sign Out'}
              </button>
            </div>
          )}

          {/* Mobile hamburger button */}
          <button
            onClick={toggleMobileMenu}
            className="inline-flex items-center justify-center rounded-lg p-2 sm:hidden hover:bg-[var(--color-card-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile navigation menu */}
      {isMobileMenuOpen && (
        <nav
          className="border-t-2 border-[var(--color-border)] px-4 py-3 sm:hidden animate-slide-down motion-reduce:animate-none"
          aria-label="Mobile navigation"
        >
          <div className="space-y-1">
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMobileMenu}
                  className={`
                    block rounded-xl px-4 py-2.5 text-sm font-medium transition-colors
                    ${isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                      : 'text-[var(--color-muted)] hover:bg-[var(--color-card-bg)] hover:text-[var(--color-foreground)]'}
                  `}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Mobile user actions */}
          {user && (
            <div className="mt-3 border-t-2 border-[var(--color-border)] pt-3">
              <div className="flex items-center gap-2 px-4 py-1">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-100 text-xs font-bold text-gold-800 dark:bg-gold-900 dark:text-gold-200">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
                <p className="text-sm font-medium">{user.displayName}</p>
                {isGuest && (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                    Guest
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  closeMobileMenu();
                  handleLogout();
                }}
                className="mt-1 block w-full rounded-xl px-4 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
              >
                {isGuest ? 'Exit' : 'Sign Out'}
              </button>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
