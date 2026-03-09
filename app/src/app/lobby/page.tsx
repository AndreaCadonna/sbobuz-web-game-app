'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { RoomList } from '@/components/lobby/RoomList';

export default function LobbyPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Game Lobby</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Join an existing room or create your own
          </p>
        </div>
        <Link href="/lobby/create">
          <Button size="lg">Create Room</Button>
        </Link>
      </div>

      <RoomList />
    </div>
  );
}
