'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { RoomList } from '@/components/lobby/RoomList';

export default function LobbyPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Game Lobby</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Join an existing room or create your own
          </p>
        </div>
        <Link href="/lobby/create">
          <Button>Create Room</Button>
        </Link>
      </div>

      <RoomList />
    </div>
  );
}
