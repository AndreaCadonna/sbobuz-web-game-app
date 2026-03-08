/**
 * GameOverModal — Displays game results when the game ends.
 *
 * Shows the winner, reason, and a button to return to the lobby.
 */
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface GameOverModalProps {
  isOpen: boolean;
  winnerId: string | null;
  winnerName: string;
  reason: string | null;
  isCurrentUserWinner: boolean;
  onClose: () => void;
}

export function GameOverModal({
  isOpen,
  winnerId,
  winnerName,
  reason,
  isCurrentUserWinner,
  onClose,
}: GameOverModalProps): React.JSX.Element | null {
  const router = useRouter();

  const handleBackToLobby = useCallback(() => {
    onClose();
    router.push('/lobby');
  }, [onClose, router]);

  const reasonLabel =
    reason === 'completed'
      ? 'Game completed'
      : reason === 'cancelled'
        ? 'Game cancelled'
        : reason === 'forfeit'
          ? 'Game forfeited'
          : 'Game over';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Game Over">
      <div className="space-y-4 text-center">
        {winnerId ? (
          <>
            <div className="text-4xl" aria-hidden="true">
              {isCurrentUserWinner ? '\u{1F3C6}' : '\u{1F44F}'}
            </div>
            <h3 className="text-xl font-bold">
              {isCurrentUserWinner ? 'You win!' : `${winnerName} wins!`}
            </h3>
          </>
        ) : (
          <>
            <div className="text-4xl" aria-hidden="true">{'\u274C'}</div>
            <h3 className="text-xl font-bold">No winner</h3>
          </>
        )}

        <p className="text-sm text-[var(--color-muted)]">{reasonLabel}</p>

        <div className="flex justify-center gap-3 pt-4">
          <Button variant="primary" onClick={handleBackToLobby}>
            Back to Lobby
          </Button>
        </div>
      </div>
    </Modal>
  );
}
