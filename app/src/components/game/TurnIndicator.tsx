/**
 * TurnIndicator — Displays whose turn it is and the play direction.
 *
 * Sketchy: 2px ink border, paper bg. On your turn: green glow + pulsing dot.
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
  const directionArrow = direction === 1 ? '\u2191 cw' : '\u2193 ccw';

  const borderClass = isMyTurn
    ? 'border-accent-2 shadow-sketch-green'
    : 'border-ink shadow-sketch-sm';

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-md border-2 bg-paper px-3 py-2 ${borderClass}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {isMyTurn && (
          <span
            className="inline-flex h-2.5 w-2.5 rounded-full border-[1.5px] border-ink bg-accent-2 animate-pulse motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        <span className="font-display text-xl font-bold leading-none">
          {isMyTurn ? 'Your turn' : `${currentPlayerName}'s turn`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 font-body text-[13px]">
        <span className="pill gray" aria-label={`Direction: ${directionArrow}`}>
          {directionArrow}
        </span>
        {freePlay && <span className="pill">free play</span>}
        {nextCardOverride === 'lower' && <span className="pill yellow">must play lower</span>}
        {phase === 'awaiting_queen_declaration' && isMyTurn && (
          <span className="pill blue">declare direction</span>
        )}
        {phase === 'awaiting_post_clear_play' && isMyTurn && (
          <span className="pill green">pile cleared! play any card</span>
        )}
      </div>
    </div>
  );
}
