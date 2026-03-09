/**
 * TurnIndicator — Displays whose turn it is and the play direction.
 */
'use client';

interface TurnIndicatorProps {
  currentPlayerName: string;
  isMyTurn: boolean;
  direction: 1 | -1;
  freePlay: boolean;
  nextCardOverride: 'lower' | null;
  phase: string;
}

export function TurnIndicator({
  currentPlayerName,
  isMyTurn,
  direction,
  freePlay,
  nextCardOverride,
  phase,
}: TurnIndicatorProps): React.JSX.Element {
  const directionLabel = direction === 1 ? 'Ascending' : 'Descending';
  const directionArrow = direction === 1 ? '\u2191' : '\u2193';

  return (
    <div
      className={`
        rounded-xl border-2 px-3 py-2
        transition-all duration-200 motion-reduce:transition-none
        ${isMyTurn
          ? 'border-gold-400 bg-gold-50/60 shadow-warm dark:bg-gold-950/20 dark:border-gold-600/60'
          : 'border-[var(--color-border)] bg-[var(--color-card-bg)]'}
      `}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isMyTurn && (
            <span className="inline-flex h-3 w-3 rounded-full bg-gold-500 animate-pulse motion-reduce:animate-none ring-2 ring-gold-400/30" />
          )}
          <span className="text-sm font-bold">
            {isMyTurn ? 'Your turn' : `${currentPlayerName}'s turn`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          {/* Direction */}
          <span className="flex items-center gap-1 rounded-full bg-[var(--color-card-bg)] px-2.5 py-1 ring-1 ring-[var(--color-border)]" aria-label={`Direction: ${directionLabel}`}>
            <span aria-hidden="true">{directionArrow}</span>
            {directionLabel}
          </span>

          {/* Special states */}
          {freePlay && (
            <span className="rounded-full bg-brand-100 px-2.5 py-1 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-900/50 dark:text-brand-300 dark:ring-brand-800">
              Free play
            </span>
          )}
          {nextCardOverride === 'lower' && (
            <span className="rounded-full bg-gold-100 px-2.5 py-1 text-gold-700 ring-1 ring-gold-200 dark:bg-gold-900/50 dark:text-gold-300 dark:ring-gold-800">
              Must play lower
            </span>
          )}
          {phase === 'awaiting_queen_declaration' && isMyTurn && (
            <span className="rounded-full bg-purple-100 px-2.5 py-1 text-purple-700 ring-1 ring-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:ring-purple-800">
              Declare direction
            </span>
          )}
          {phase === 'awaiting_post_clear_play' && isMyTurn && (
            <span className="rounded-full bg-brand-100 px-2.5 py-1 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-900/50 dark:text-brand-300 dark:ring-brand-800">
              Pile cleared! Play any card
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
