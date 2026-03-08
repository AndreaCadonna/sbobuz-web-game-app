/**
 * CreateRoomForm — Form for creating a new game room.
 */
'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useRoomStore } from '@/stores/room-store';
import { createRoomSchema, type CreateRoomFormData } from '@/lib/validators';

interface FieldErrors {
  name?: string;
  maxPlayers?: string;
  turnTimerSeconds?: string;
}

export function CreateRoomForm(): React.JSX.Element {
  const router = useRouter();
  const isCreatingRoom = useRoomStore((s) => s.isCreatingRoom);
  const error = useRoomStore((s) => s.error);
  const createRoom = useRoomStore((s) => s.createRoom);

  const [formData, setFormData] = useState<CreateRoomFormData>({
    name: '',
    maxPlayers: 4,
    turnTimerSeconds: 30,
    isPrivate: false,
    allowAI: true,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value,
    }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const result = createRoomSchema.safeParse(formData);
      if (!result.success) {
        const errors: FieldErrors = {};
        for (const issue of result.error.issues) {
          const field = issue.path[0];
          if (field === 'name' || field === 'maxPlayers' || field === 'turnTimerSeconds') {
            errors[field] = issue.message;
          }
        }
        setFieldErrors(errors);
        return;
      }

      const roomId = await createRoom(result.data);
      if (roomId) {
        router.push(`/lobby/${roomId}`);
      }
    },
    [formData, createRoom, router],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Input
        label="Room Name"
        name="name"
        type="text"
        value={formData.name}
        onChange={handleChange}
        error={fieldErrors.name}
        placeholder="Give your room a name"
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Max Players"
          name="maxPlayers"
          type="number"
          min={2}
          max={5}
          value={String(formData.maxPlayers)}
          onChange={handleChange}
          error={fieldErrors.maxPlayers}
        />

        <Input
          label="Turn Timer (seconds)"
          name="turnTimerSeconds"
          type="number"
          min={15}
          max={120}
          value={String(formData.turnTimerSeconds)}
          onChange={handleChange}
          error={fieldErrors.turnTimerSeconds}
        />
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isPrivate"
            checked={formData.isPrivate}
            onChange={handleChange}
            className="h-4 w-4 rounded border-[var(--color-border)]"
          />
          Private Room
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="allowAI"
            checked={formData.allowAI}
            onChange={handleChange}
            className="h-4 w-4 rounded border-[var(--color-border)]"
          />
          Allow AI Players
        </label>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" fullWidth isLoading={isCreatingRoom}>
          Create Room
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
