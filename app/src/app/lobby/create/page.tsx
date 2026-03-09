'use client';

import { CreateRoomForm } from '@/components/lobby/CreateRoomForm';

export default function CreateRoomPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">Create Room</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Set up a new game room
        </p>
      </div>

      <div className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 shadow-card">
        <CreateRoomForm />
      </div>
    </div>
  );
}
