/**
 * GameControls — Action buttons for the current player.
 *
 * Provides buttons to play selected cards, pick up the pile,
 * and declare direction (after playing a Queen).
 * All actions are sent to the server via socket; no local game logic.
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

  const handleDeclareHigher = useCallback(() => {
    onDeclareDirection('higher');
  }, [onDeclareDirection]);

  const handleDeclareLower = useCallback(() => {
    onDeclareDirection('lower');
  }, [onDeclareDirection]);

  const handleClearSelection = useCallback(() => {
    clearCardSelection();
  }, [clearCardSelection]);

  // Awaiting queen declaration phase
  if (phase === 'awaiting_queen_declaration' && isMyTurn) {
    return (
      <div className="space-y-3" role="group" aria-label="Declare direction">
        <p className="text-sm text-center font-bold text-purple-700 dark:text-purple-300">
          You played a Queen! Declare the next direction:
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="primary"
            onClick={handleDeclareHigher}
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            Higher
          </Button>
          <Button
            variant="secondary"
            onClick={handleDeclareLower}
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            Lower
          </Button>
        </div>
        {actionError && (
          <p className="text-center text-sm font-medium text-red-600 dark:text-red-400" role="alert">
            {actionError}
          </p>
        )}
      </div>
    );
  }

  if (!isMyTurn) {
    return (
      <div className="flex items-center justify-center py-3">
        <p className="text-sm font-medium text-[var(--color-muted)]">Waiting for opponent...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" role="group" aria-label="Game actions">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="primary"
          onClick={handlePlay}
          isLoading={isSubmitting}
          disabled={isSubmitting || selectedCardCount === 0}
        >
          Play{selectedCardCount > 0 ? ` (${String(selectedCardCount)})` : ''}
        </Button>
        <Button
          variant="secondary"
          onClick={handlePickUp}
          isLoading={isSubmitting}
          disabled={isSubmitting}
        >
          Pick Up Pile
        </Button>
        {selectedCardCount > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClearSelection}>
            Clear Selection
          </Button>
        )}
      </div>

      {actionError && (
        <p className="text-center text-sm font-medium text-red-600 dark:text-red-400" role="alert">
          {actionError}
        </p>
      )}
    </div>
  );
}
