'use client';

import { CreateRoomForm } from '@/components/lobby/CreateRoomForm';

export default function CreateRoomPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Create Room</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Set up a new game room
        </p>
      </div>

      <CreateRoomForm />
    </div>
  );
}
