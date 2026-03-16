/**
 * GameMobileOverlay — Floating burger menu (top-left) and turn badge (top-right)
 * for mobile game view. Replaces the full AppHeader and TurnIndicator.
 */
'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/hooks/use-auth';

const NAV_LINKS = [
  { href: '/lobby', label: 'Lobby', guestVisible: true },
  { href: '/leaderboard', label: 'Leaderboard', guestVisible: false },
  { href: '/how-to-play', label: 'How to Play', guestVisible: true },
] as const;

interface GameMobileOverlayProps {
  currentPlayerName: string;
  isMyTurn: boolean;
  direction: 1 | -1;
  freePlay: boolean;
  nextCardOverride: 'lower' | null;
  phase: string;
}

export function GameMobileOverlay({
  currentPlayerName,
  isMyTurn,
  direction,
  freePlay,
  nextCardOverride,
  phase,
}: GameMobileOverlayProps): React.JSX.Element {
  const { user, isGuest, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = useMemo(
    () => NAV_LINKS.filter((link) => !isGuest || link.guestVisible),
    [isGuest],
  );

  const handleLogout = useCallback((): void => {
    setMenuOpen(false);
    void logout();
  }, [logout]);

  const directionArrow = direction === 1 ? '\u2191' : '\u2193';

  // Build status badges
  const badges: string[] = [];
  if (freePlay) badges.push('Free');
  if (nextCardOverride === 'lower') badges.push('Lower');
  if (phase === 'awaiting_queen_declaration' && isMyTurn) badges.push('Declare');
  if (phase === 'awaiting_post_clear_play' && isMyTurn) badges.push('Cleared!');

  return (
    <>
      {/* Floating burger menu — top left */}
      <div className="fixed top-2 left-2 z-50">
        <button
          onClick={() => setMenuOpen((p) => !p)}
          className={`
            flex h-9 w-9 items-center justify-center rounded-full
            border-2 border-[var(--color-border)] bg-[var(--color-background)]/90 backdrop-blur-sm
            shadow-md transition-colors
            hover:bg-[var(--color-card-bg)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400
          `}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute top-11 left-0 w-44 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur-sm shadow-lg overflow-hidden">
            <nav aria-label="Game menu">
              {navLinks.map((link) => {
                const isActive = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`
                      block px-3 py-2 text-sm font-medium transition-colors
                      ${isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300'
                        : 'text-[var(--color-muted)] hover:bg-[var(--color-card-bg)] hover:text-[var(--color-foreground)]'}
                    `}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            {user && (
              <div className="border-t border-[var(--color-border)]">
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-muted)]">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-100 text-[9px] font-bold text-gold-800 dark:bg-gold-900 dark:text-gold-200">
                    {user.displayName.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{user.displayName}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="block w-full px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                >
                  {isGuest ? 'Exit' : 'Sign Out'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating turn badge — top right */}
      <div className="fixed top-2 right-2 z-50">
        <div
          className={`
            flex items-center gap-1.5 rounded-full px-2.5 py-1
            border-2 shadow-md backdrop-blur-sm
            ${isMyTurn
              ? 'border-gold-400 bg-gold-50/90 dark:bg-gold-950/80 dark:border-gold-600/60'
              : 'border-[var(--color-border)] bg-[var(--color-background)]/90'}
          `}
          role="status"
          aria-live="polite"
        >
          {isMyTurn && (
            <span className="inline-flex h-2 w-2 rounded-full bg-gold-500 animate-pulse motion-reduce:animate-none" />
          )}
          <span className="text-[11px] font-bold truncate max-w-[90px]">
            {isMyTurn ? 'Your turn' : currentPlayerName}
          </span>
          <span className="text-[10px] font-semibold text-[var(--color-muted)]">{directionArrow}</span>
          {badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[8px] font-bold text-brand-700 dark:bg-brand-900/50 dark:text-brand-300"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>

      {/* Click-away overlay to close menu */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
