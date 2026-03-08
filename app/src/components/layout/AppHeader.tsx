/**
 * AppHeader — Top navigation bar with nav links, user info, and connection status.
 *
 * Desktop: horizontal nav links. Mobile: hamburger menu.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';

import { ConnectionStatus } from '@/components/ui/ConnectionStatus';
import { useAuth } from '@/hooks/use-auth';

const NAV_LINKS = [
  { href: '/lobby', label: 'Lobby' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/profile', label: 'Profile' },
] as const;

export function AppHeader(): React.JSX.Element {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    <header className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Left: logo and desktop nav */}
        <div className="flex items-center gap-6">
          <Link href="/lobby" className="text-lg font-bold" onClick={closeMobileMenu}>
            Sbobuz
          </Link>
          <nav className="hidden items-center gap-4 sm:flex" aria-label="Main navigation">
            {NAV_LINKS.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    text-sm transition-colors
                    ${isActive
                      ? 'font-medium text-[var(--color-foreground)]'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'}
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
        <div className="flex items-center gap-3">
          <ConnectionStatus />

          {/* Desktop user info */}
          {user && (
            <div className="hidden items-center gap-3 sm:flex">
              <Link
                href="/profile"
                className="text-sm font-medium hover:text-brand-600 transition-colors"
              >
                {user.displayName}
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]"
              >
                Sign Out
              </button>
            </div>
          )}

          {/* Mobile hamburger button */}
          <button
            onClick={toggleMobileMenu}
            className="inline-flex items-center justify-center rounded-md p-2 sm:hidden hover:bg-[var(--color-card-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
          className="border-t border-[var(--color-border)] px-4 py-3 sm:hidden animate-slide-down motion-reduce:animate-none"
          aria-label="Mobile navigation"
        >
          <div className="space-y-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMobileMenu}
                  className={`
                    block rounded-md px-3 py-2 text-sm transition-colors
                    ${isActive
                      ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300'
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
            <div className="mt-3 border-t border-[var(--color-border)] pt-3">
              <p className="px-3 text-sm font-medium">{user.displayName}</p>
              <button
                onClick={() => {
                  closeMobileMenu();
                  handleLogout();
                }}
                className="mt-1 block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
              >
                Sign Out
              </button>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
