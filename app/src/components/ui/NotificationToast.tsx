/**
 * NotificationToast — Toast notification container and individual toasts.
 */
'use client';

import { useUIStore } from '@/stores/ui-store';
import type { Notification, NotificationType } from '@/types/client';

const typeStyles: Record<NotificationType, string> = {
  info: 'border-l-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/80 dark:text-blue-200',
  success: 'border-l-brand-500 bg-brand-50 text-brand-900 dark:bg-brand-950/80 dark:text-brand-200',
  warning: 'border-l-gold-500 bg-gold-50 text-gold-900 dark:bg-gold-950/80 dark:text-gold-200',
  error: 'border-l-red-500 bg-red-50 text-red-900 dark:bg-red-950/80 dark:text-red-200',
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
        animate-slide-up flex items-center gap-3 rounded-xl border-l-4 px-4 py-3 shadow-lg backdrop-blur-sm
        ${typeStyles[notification.type]}
      `}
    >
      <p className="flex-1 text-sm font-medium">{notification.message}</p>
      <button
        onClick={() => onDismiss(notification.id)}
        className="shrink-0 rounded-lg p-1 transition-colors hover:bg-black/10"
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
