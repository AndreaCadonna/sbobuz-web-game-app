'use client';

import { CreateRoomForm } from '@/components/lobby/CreateRoomForm';

export default function CreateRoomPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="sk sk-wobble p-6">
        <div className="label-tiny">modal {'\u00B7'} + create room</div>
        <h1 className="mt-1 font-display text-3xl font-bold">New room</h1>
        <div className="mt-4">
          <CreateRoomForm />
        </div>
      </div>
    </div>
  );
}
