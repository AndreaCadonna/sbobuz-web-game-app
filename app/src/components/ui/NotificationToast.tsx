/**
 * NotificationToast — Toast notification container and individual toasts.
 */
'use client';

import { useUIStore } from '@/stores/ui-store';
import type { Notification, NotificationType } from '@/types/client';

const typeStyles: Record<NotificationType, string> = {
  info: 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  success: 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200',
  warning: 'border-yellow-500 bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
  error: 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
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
        animate-slide-up flex items-center gap-3 rounded-lg border-l-4 px-4 py-3 shadow-lg
        ${typeStyles[notification.type]}
      `}
    >
      <p className="flex-1 text-sm">{notification.message}</p>
      <button
        onClick={() => onDismiss(notification.id)}
        className="shrink-0 rounded p-1 transition-colors hover:bg-black/10"
        aria-label="Dismiss notification"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
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
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {notifications.map((n) => (
        <div key={n.id} className="pointer-events-auto">
          <ToastItem notification={n} onDismiss={removeNotification} />
        </div>
      ))}
    </div>
  );
}
