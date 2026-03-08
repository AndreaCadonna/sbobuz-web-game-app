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
        rounded-lg border px-4 py-3
        transition-colors duration-200 motion-reduce:transition-none
        ${isMyTurn
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40'
          : 'border-[var(--color-border)] bg-[var(--color-card-bg)]'}
      `}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {isMyTurn && (
            <span className="inline-flex h-3 w-3 rounded-full bg-brand-500 animate-pulse motion-reduce:animate-none" />
          )}
          <span className="text-sm font-medium">
            {isMyTurn ? 'Your turn' : `${currentPlayerName}'s turn`}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
          {/* Direction */}
          <span className="flex items-center gap-1" aria-label={`Direction: ${directionLabel}`}>
            <span aria-hidden="true">{directionArrow}</span>
            {directionLabel}
          </span>

          {/* Special states */}
          {freePlay && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900 dark:text-green-300">
              Free play
            </span>
          )}
          {nextCardOverride === 'lower' && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              Must play lower
            </span>
          )}
          {phase === 'awaiting_queen_declaration' && isMyTurn && (
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              Declare direction
            </span>
          )}
          {phase === 'awaiting_post_clear_play' && isMyTurn && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700 dark:bg-green-900 dark:text-green-300">
              Pile cleared! Play any card
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
