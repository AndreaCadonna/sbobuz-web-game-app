/**
 * ConnectionStatus — Visual indicator for WebSocket connection state.
 *
 * Hand-drawn dot + mono label. Green = connected, orange = disconnected,
 * yellow = reconnecting.
 */
'use client';

import { useSocketStore } from '@/stores/socket-store';

export function ConnectionStatus(): React.JSX.Element {
  const status = useSocketStore((s) => s.status);
  const latencyMs = useSocketStore((s) => s.latencyMs);
  const reconnectAttempt = useSocketStore((s) => s.reconnectAttempt);

  const statusConfig = {
    connected: {
      dotClass: 'bg-accent-2',
      label: 'Connected',
      detail: latencyMs !== null ? `${String(latencyMs)}ms` : undefined,
    },
    reconnecting: {
      dotClass: 'bg-accent-y animate-pulse motion-reduce:animate-none',
      label: 'Reconnecting',
      detail: `Attempt ${String(reconnectAttempt)}`,
    },
    disconnected: {
      dotClass: 'bg-accent',
      label: 'Disconnected',
      detail: undefined,
    },
  } as const;

  const config = statusConfig[status];

  return (
    <div
      className="flex items-center gap-1.5 font-mono text-[11px] text-ink-soft"
      aria-label={`Connection status: ${config.label}`}
    >
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-ink ${config.dotClass}`}
        aria-hidden="true"
      />
      <span>
        {config.label}
        {config.detail ? ` \u00B7 ${config.detail}` : ''}
      </span>
    </div>
  );
}
