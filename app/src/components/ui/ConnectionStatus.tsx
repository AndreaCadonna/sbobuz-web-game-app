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
      color: 'bg-brand-400',
      ring: 'ring-brand-400/30',
      label: 'Connected',
      detail: latencyMs !== null ? `${String(latencyMs)}ms` : undefined,
    },
    reconnecting: {
      color: 'bg-gold-400 animate-pulse',
      ring: 'ring-gold-400/30',
      label: 'Reconnecting',
      detail: `Attempt ${String(reconnectAttempt)}`,
    },
    disconnected: {
      color: 'bg-red-400',
      ring: 'ring-red-400/30',
      label: 'Disconnected',
      detail: undefined,
    },
  } as const;

  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2" aria-label={`Connection status: ${config.label}`}>
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ${config.color} ${config.ring}`}
        aria-hidden="true"
      />
      <span className="text-xs font-medium text-[var(--color-muted)]">
        {config.label}
        {config.detail ? ` (${config.detail})` : ''}
      </span>
    </div>
  );
}
