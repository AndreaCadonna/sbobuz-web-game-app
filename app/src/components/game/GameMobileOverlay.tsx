/**
 * GameMobileOverlay — Floating burger menu (top-left) and turn badge
 * (top-right) for mobile game view. Sketchy hand-drawn styling.
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

  const badges: string[] = [];
  if (freePlay) badges.push('free');
  if (nextCardOverride === 'lower') badges.push('lower');
  if (phase === 'awaiting_queen_declaration' && isMyTurn) badges.push('declare');
  if (phase === 'awaiting_post_clear_play' && isMyTurn) badges.push('cleared');

  return (
    <>
      {/* Floating burger menu — top left */}
      <div className="fixed left-2 top-2 z-50">
        <button
          onClick={() => setMenuOpen((p) => !p)}
          className="flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink bg-paper shadow-sketch-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-3"
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

        {menuOpen && (
          <div className="absolute left-0 top-11 w-44 overflow-hidden rounded-md border-2 border-ink bg-paper shadow-sketch">
            <nav aria-label="Game menu">
              {navLinks.map((link) => {
                const isActive = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`block px-3 py-2 font-display text-lg leading-none ${isActive ? 'bg-paper-2' : 'hover:bg-paper-2'}`}
                  >
                    {isActive ? <span className="text-accent">{'\u25B8 '}</span> : null}
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            {user && (
              <div className="border-t-2 border-dashed border-line-soft">
                <div className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] text-ink-soft">
                  <span>{'\u{1F464} '}{user.displayName}</span>
                  {isGuest && <span className="pill gray ml-auto text-[10px]">guest</span>}
                </div>
                <button
                  onClick={handleLogout}
                  className="block w-full px-3 py-2 text-left font-display text-base text-accent hover:bg-paper-2"
                >
                  {isGuest ? 'exit' : 'sign out'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating turn badge — top right */}
      <div className="fixed right-2 top-2 z-50">
        <div
          className={`flex items-center gap-1.5 rounded-md border-2 bg-paper px-2.5 py-1 shadow-sketch-sm ${isMyTurn ? 'border-accent-2' : 'border-ink'}`}
          role="status"
          aria-live="polite"
        >
          {isMyTurn && (
            <span className="inline-flex h-2 w-2 rounded-full border-[1.5px] border-ink bg-accent-2 animate-pulse motion-reduce:animate-none" />
          )}
          <span className="max-w-[100px] truncate font-display text-sm font-bold leading-none">
            {isMyTurn ? 'Your turn' : currentPlayerName}
          </span>
          <span className="font-mono text-[10px] text-ink-soft">{directionArrow}</span>
          {badges.map((badge) => (
            <span key={badge} className="pill !px-1.5 !py-0 !text-[9px]">
              {badge}
            </span>
          ))}
        </div>
      </div>

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
