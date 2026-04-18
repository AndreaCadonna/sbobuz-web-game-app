/**
 * GameControls — Sketchy action bar.
 *
 * Matches wireframe action-zone: primary Play button, accent Pick-up pile
 * button, a contextual hint, and ghost Log / Leave on the right. Compact on
 * mobile: tighter gaps, smaller buttons.
 */
'use client';

import { useCallback } from 'react';

import { Button } from '@/components/ui/Button';
import { useUIStore } from '@/stores/ui-store';

interface GameControlsProps {
  isMyTurn: boolean;
  isSubmitting: boolean;
  phase: string;
  selectedCardCount: number;
  actionError: string | null;
  onPlayCards: (cardIds: string[]) => void;
  onPickUpPile: () => void;
  onDeclareDirection: (direction: 'higher' | 'lower') => void;
}

export function GameControls({
  isMyTurn,
  isSubmitting,
  phase,
  selectedCardCount,
  actionError,
  onPlayCards,
  onPickUpPile,
  onDeclareDirection,
}: GameControlsProps): React.JSX.Element {
  const selectedCardIds = useUIStore((s) => s.selectedCardIds);
  const clearCardSelection = useUIStore((s) => s.clearCardSelection);

  const handlePlay = useCallback(() => {
    if (selectedCardIds.length > 0) {
      onPlayCards([...selectedCardIds]);
      clearCardSelection();
    }
  }, [selectedCardIds, onPlayCards, clearCardSelection]);

  const handlePickUp = useCallback(() => {
    onPickUpPile();
    clearCardSelection();
  }, [onPickUpPile, clearCardSelection]);

  const handleDeclareHigher = useCallback(() => onDeclareDirection('higher'), [onDeclareDirection]);
  const handleDeclareLower = useCallback(() => onDeclareDirection('lower'), [onDeclareDirection]);
  const handleClearSelection = useCallback(() => clearCardSelection(), [clearCardSelection]);

  // Awaiting queen declaration phase
  if (phase === 'awaiting_queen_declaration' && isMyTurn) {
    return (
      <div className="sk flex flex-wrap items-center gap-3" role="group" aria-label="Declare direction">
        <span className="font-display text-lg font-bold text-accent-3">
          Queen played! Declare direction:
        </span>
        <Button variant="primary" size="sm" onClick={handleDeclareHigher} isLoading={isSubmitting} disabled={isSubmitting}>
          {'\u2191 '}Higher
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDeclareLower} isLoading={isSubmitting} disabled={isSubmitting}>
          {'\u2193 '}Lower
        </Button>
        {actionError && (
          <p className="w-full text-center font-body text-sm font-semibold text-accent" role="alert">
            {actionError}
          </p>
        )}
      </div>
    );
  }

  if (!isMyTurn) {
    return (
      <div className="sk flex items-center justify-center py-2">
        <p className="font-body text-sm italic text-ink-soft">Waiting for opponent...</p>
      </div>
    );
  }

  return (
    <div className="sk space-y-2" role="group" aria-label="Game actions">
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="primary" size="md" onClick={handlePlay} isLoading={isSubmitting} disabled={isSubmitting || selectedCardCount === 0}>
          {'\u25B8 Play'}{selectedCardCount > 0 ? ` (${String(selectedCardCount)})` : ''}
        </Button>
        <Button variant="accent" size="md" onClick={handlePickUp} isLoading={isSubmitting} disabled={isSubmitting}>
          {'\u2302 Pick up pile'}
        </Button>
        {selectedCardCount > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClearSelection}>
            clear
          </Button>
        )}
      </div>
      {actionError && (
        <p className="font-body text-sm font-semibold text-accent" role="alert">
          {actionError}
        </p>
      )}
    </div>
  );
}
