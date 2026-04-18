/**
 * CreateRoomForm — Sketchy form for creating a new game room.
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
        label="name"
        name="name"
        type="text"
        value={formData.name}
        onChange={handleChange}
        error={fieldErrors.name}
        placeholder="Friday night showdown"
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="max players"
          name="maxPlayers"
          type="number"
          min={2}
          max={5}
          value={String(formData.maxPlayers)}
          onChange={handleChange}
          error={fieldErrors.maxPlayers}
        />

        <Input
          label="turn timer (30–120s)"
          name="turnTimerSeconds"
          type="number"
          min={15}
          max={120}
          value={String(formData.turnTimerSeconds)}
          onChange={handleChange}
          error={fieldErrors.turnTimerSeconds}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 font-body text-[15px]">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name="allowAI"
            checked={formData.allowAI}
            onChange={handleChange}
            className="h-4 w-4 border-2 border-ink accent-ink"
          />
          allow AI opponents
        </label>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name="isPrivate"
            checked={formData.isPrivate}
            onChange={handleChange}
            className="h-4 w-4 border-2 border-ink accent-ink"
          />
          private (invite only)
        </label>
      </div>

      {error && (
        <div className="sk sk-alt !py-2 !px-3 text-sm font-semibold text-accent" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" variant="accent" size="md" isLoading={isCreatingRoom}>
          Create {'\u25B8'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={() => router.back()}
        >
          cancel
        </Button>
      </div>
    </form>
  );
}
