'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { RoomList } from '@/components/lobby/RoomList';

export default function LobbyPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header row */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold">Find a game</h1>
          <p className="mt-0.5 font-body text-sm text-ink-soft">
            Browse public rooms, join one, or create your own.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm">
            Join by code
          </Button>
          <Link href="/lobby/create">
            <Button variant="accent" size="md">
              + Create room
            </Button>
          </Link>
        </div>
      </div>

      <RoomList />
    </div>
  );
}
