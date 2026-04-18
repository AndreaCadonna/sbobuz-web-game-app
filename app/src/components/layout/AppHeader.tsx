/**
 * AppHeader — Sketchy topbar.
 *
 * Paper bg, 2px ink bottom border, sticky. Logo = "Sbobuz" in Caveat 34px
 * with a small rotated orange circle before it. Nav links are nav-tab style
 * (paper-2 bg, 2px ink border, slight rotation). On mobile collapses into a
 * hamburger menu.
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

// ── Logo ────────────────────────────────────────────────────────

function Logo({ onClick }: { onClick?: () => void }): React.JSX.Element {
  return (
    <Link
      href="/lobby"
      className="flex items-center gap-2 font-display text-[34px] font-bold leading-none text-ink"
      onClick={onClick}
    >
      <span
        className="inline-block h-[18px] w-[18px] rounded-full border-2 border-ink bg-accent"
        style={{ transform: 'translateY(3px) rotate(-4deg)' }}
        aria-hidden="true"
      />
      <span>Sbobuz</span>
    </Link>
  );
}

// ── Component ───────────────────────────────────────────────────

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
    <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-3 sm:px-7 sm:py-3.5">
        {/* Left: logo */}
        <Logo onClick={closeMobileMenu} />

        {/* Desktop nav */}
        <nav className="ml-4 hidden flex-wrap items-center gap-2 sm:flex" aria-label="Main navigation">
          {navLinks.map((link, i) => {
            const isActive = pathname.startsWith(link.href);
            const rotate = i % 2 === 0 ? '-rotate-[0.3deg]' : 'rotate-[0.2deg]';
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  font-display text-[22px] leading-none
                  border-2 border-ink rounded-[10px]
                  px-3.5 py-1
                  ${isActive ? 'bg-paper font-bold' : 'bg-paper-2 text-ink'}
                  ${rotate}
                  transition-transform duration-150 hover:-translate-y-0.5 hover:bg-paper
                `}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && <span className="text-accent" aria-hidden="true">{'\u25B8 '}</span>}
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ConnectionStatus />

          {/* Desktop user info */}
          {user && (
            <div className="hidden items-center gap-2 sm:flex font-mono text-[13px] text-ink-soft">
              <Link
                href={isGuest ? '/lobby' : '/profile'}
                className="flex items-center gap-1.5 hover:text-ink transition-colors"
              >
                <span className="font-display text-ink">{'\u{1F464}'}</span>
                <span className="hidden lg:inline">{user.displayName}</span>
                {isGuest && <span className="pill gray ml-1 text-[11px]">guest</span>}
              </Link>
              <span aria-hidden="true">{'\u00B7'}</span>
              <button
                onClick={handleLogout}
                className="underline-offset-2 hover:underline hover:text-ink"
              >
                {isGuest ? 'exit' : 'sign out'}
              </button>
            </div>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={toggleMobileMenu}
            className="inline-flex items-center justify-center rounded-md border-2 border-ink bg-paper p-1.5 shadow-sketch-sm sm:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-3"
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

      {/* Mobile nav */}
      {isMobileMenuOpen && (
        <nav
          className="border-t-2 border-ink bg-paper px-4 py-3 animate-slide-down motion-reduce:animate-none sm:hidden"
          aria-label="Mobile navigation"
        >
          <div className="space-y-2">
            {navLinks.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMobileMenu}
                  className={`
                    block font-display text-xl border-2 border-ink rounded-md px-3 py-1.5
                    ${isActive ? 'bg-paper shadow-sketch-sm' : 'bg-paper-2'}
                  `}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {user && (
            <div className="mt-3 border-t-2 border-dashed border-line-soft pt-3">
              <p className="font-mono text-xs text-ink-soft px-1 mb-1.5">
                {'\u{1F464} '}{user.displayName}
                {isGuest && <span className="pill gray ml-2 text-[10px]">guest</span>}
              </p>
              <button
                onClick={() => {
                  closeMobileMenu();
                  handleLogout();
                }}
                className="block w-full rounded-md border-2 border-ink bg-accent/10 px-3 py-1.5 text-left font-display text-lg text-accent"
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
