/**
 * GameOverModal — Sketchy game-over overlay.
 *
 * Winner variant: big Caveat "You won!" in green + Play again (accent) /
 * Return to lobby buttons. Cancelled variant: muted heading + reason pill.
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

function reasonPillLabel(reason: string | null): string {
  if (reason === 'cancelled') return 'cancelled_disconnect';
  if (reason === 'completed') return 'completed';
  if (reason === 'forfeit') return 'forfeit';
  return reason ?? 'ended';
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

  const handlePlayAgain = useCallback(() => {
    onClose();
    router.push('/lobby');
  }, [onClose, router]);

  const isCancelled = reason === 'cancelled';
  const title = isCancelled ? 'Game cancelled' : 'Game over';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-5 text-center">
        {winnerId && !isCancelled ? (
          <>
            <h3 className="font-display text-6xl font-bold text-accent-2">
              {isCurrentUserWinner ? 'You won! \u{1F3C6}' : `${winnerName} wins!`}
            </h3>
            <p className="font-display text-2xl text-ink-soft">game complete</p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button variant="accent" size="lg" onClick={handlePlayAgain}>
                {'\u21BB Play again'}
              </Button>
              <Button variant="secondary" size="md" onClick={handleBackToLobby}>
                {'\u21E0 Return to lobby'}
              </Button>
            </div>
          </>
        ) : isCancelled ? (
          <>
            <h3 className="font-display text-5xl font-bold text-ink-soft">Game cancelled</h3>
            <p className="mx-auto max-w-sm font-body text-ink-soft">
              A player didn&rsquo;t reconnect within 30 seconds. This match doesn&rsquo;t count.
            </p>
            <div className="sk sk-alt mx-auto max-w-sm text-left">
              <div className="label-tiny">state at cancellation</div>
              <div className="mt-1 font-body text-sm">
                reason: <span className="pill">{reasonPillLabel(reason)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button variant="primary" size="md" onClick={handleBackToLobby}>
                {'\u21E0 Return to lobby'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="font-display text-5xl font-bold text-ink-soft">No winner</h3>
            <div className="sk sk-alt mx-auto max-w-sm text-left">
              <div className="label-tiny">reason</div>
              <div className="mt-1 font-body text-sm">
                <span className="pill">{reasonPillLabel(reason)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button variant="primary" size="md" onClick={handleBackToLobby}>
                {'\u21E0 Return to lobby'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
