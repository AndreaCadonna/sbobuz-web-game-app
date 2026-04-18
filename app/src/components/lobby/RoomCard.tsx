/**
 * RoomCard — Displays a single room summary in the room list.
 *
 * Sketchy grid row matching wireframe `.room-row`. Private rooms use a
 * dashed border. Player-count pills are colored by fill state: green
 * (joinable), yellow (nearly full), default (full).
 */
'use client';

import { useCallback } from 'react';

import { Button } from '@/components/ui/Button';
import type { RoomSummary } from '@/types/client';

interface RoomCardProps {
  room: RoomSummary;
  onJoin: (roomId: string) => void;
  isJoining: boolean;
}

function playerCountPillClass(count: number, max: number): string {
  const ratio = max > 0 ? count / max : 0;
  if (count >= max) return 'pill';
  if (ratio >= 0.75) return 'pill yellow';
  return 'pill green';
}

export function RoomCard({ room, onJoin, isJoining }: RoomCardProps): React.JSX.Element {
  const canJoin =
    (room.status === 'WAITING' || room.status === 'CREATED') &&
    room.playerCount < room.maxPlayers;

  const handleJoin = useCallback(() => {
    onJoin(room.roomId);
  }, [onJoin, room.roomId]);

  const borderClass = room.isPrivate ? 'border-dashed' : '';

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-[2fr_1.2fr_1fr_0.9fr_0.8fr] items-center gap-2 sm:gap-3 rounded-md border-2 border-ink bg-paper px-3.5 py-2.5 ${borderClass}`}
    >
      {/* Room name */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <strong className="font-body text-base">
            {room.isPrivate && <span aria-label="Private">{'\u{1F512} '}</span>}
            {room.name}
          </strong>
          {room.status !== 'WAITING' && room.status !== 'CREATED' && (
            <span className="pill gray">{room.status.toLowerCase()}</span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-line-soft">
          #{room.roomId.slice(0, 5)}&hellip;
        </div>
      </div>

      {/* Host */}
      <div className="font-body text-[15px]">
        <span className="sm:hidden font-mono text-[10px] uppercase tracking-wider text-ink-soft mr-2">host</span>
        {room.hostDisplayName}
      </div>

      {/* Players */}
      <div>
        <span className="sm:hidden font-mono text-[10px] uppercase tracking-wider text-ink-soft mr-2">players</span>
        <span className={playerCountPillClass(room.playerCount, room.maxPlayers)}>
          {room.playerCount} / {room.maxPlayers}
        </span>
      </div>

      {/* Timer */}
      <div className="font-body text-[15px]">
        <span className="sm:hidden font-mono text-[10px] uppercase tracking-wider text-ink-soft mr-2">timer</span>
        {room.turnTimerSeconds}s
      </div>

      {/* Join */}
      <div className="flex sm:justify-end">
        {canJoin ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleJoin}
            isLoading={isJoining}
            aria-label={`Join room ${room.name}`}
          >
            join {'\u25B8'}
          </Button>
        ) : room.isPrivate ? (
          <Button variant="ghost" size="sm" disabled>
            {'\u2014'}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled>
            full
          </Button>
        )}
      </div>
    </div>
  );
}
