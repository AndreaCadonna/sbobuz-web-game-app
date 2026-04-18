/**
 * NotificationToast — Sketchy notification toasts.
 *
 * Pill + sk styling, accent color for errors, green for success,
 * yellow for warning, blue for info.
 */
'use client';

import { useUIStore } from '@/stores/ui-store';
import type { Notification, NotificationType } from '@/types/client';

const typeStyles: Record<NotificationType, string> = {
  info: 'bg-paper border-ink shadow-sketch',
  success: 'bg-accent-2 text-white border-ink shadow-sketch',
  warning: 'bg-accent-y text-ink border-ink shadow-sketch',
  error: 'bg-accent text-white border-ink shadow-sketch',
};

const typeLabels: Record<NotificationType, string> = {
  info: 'i',
  success: '\u2713',
  warning: '!',
  error: '\u26A0',
};

function ToastItem({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className={`
        animate-slide-up flex items-center gap-3 rounded-md border-2 px-3 py-2
        ${typeStyles[notification.type]}
      `}
    >
      <span className="font-display text-lg font-bold leading-none" aria-hidden="true">
        {typeLabels[notification.type]}
      </span>
      <p className="flex-1 font-body text-sm font-semibold">{notification.message}</p>
      <button
        onClick={() => onDismiss(notification.id)}
        className="shrink-0 rounded border border-current px-1.5 font-display text-xs leading-none opacity-80 transition-opacity hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <svg
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

export function NotificationToastContainer(): React.JSX.Element {
  const notifications = useUIStore((s) => s.notifications);
  const removeNotification = useUIStore((s) => s.removeNotification);

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 right-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm"
      aria-live="polite"
      aria-label="Notifications"
    >
      {notifications.map((n) => (
        <div key={n.id} className="pointer-events-auto w-full">
          <ToastItem notification={n} onDismiss={removeNotification} />
        </div>
      ))}
    </div>
  );
}
