/**
 * ConnectionStatus — Visual indicator for WebSocket connection state.
 */
'use client';

import { useSocketStore } from '@/stores/socket-store';

export function ConnectionStatus(): React.JSX.Element {
  const status = useSocketStore((s) => s.status);
  const latencyMs = useSocketStore((s) => s.latencyMs);
  const reconnectAttempt = useSocketStore((s) => s.reconnectAttempt);

  const statusConfig = {
    connected: {
      color: 'bg-green-500',
      label: 'Connected',
      detail: latencyMs !== null ? `${String(latencyMs)}ms` : undefined,
    },
    reconnecting: {
      color: 'bg-yellow-500 animate-pulse',
      label: 'Reconnecting',
      detail: `Attempt ${String(reconnectAttempt)}`,
    },
    disconnected: {
      color: 'bg-red-500',
      label: 'Disconnected',
      detail: undefined,
    },
  } as const;

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2" aria-label={`Connection status: ${config.label}`}>
      <span
        className={`inline-block h-2 w-2 rounded-full ${config.color}`}
        aria-hidden="true"
      />
      <span className="text-xs text-[var(--color-muted)]">
        {config.label}
        {config.detail ? ` (${config.detail})` : ''}
      </span>
    </div>
  );
}
