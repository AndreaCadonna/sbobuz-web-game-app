/**
 * AuthenticatedLayout — Shell for authenticated pages.
 *
 * Wraps authenticated routes with auth guard, socket connection,
 * app header, and notification toasts.
 */
'use client';

import { AppHeader } from '@/components/layout/AppHeader';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { NotificationToastContainer } from '@/components/ui/NotificationToast';
import { useSocket } from '@/hooks/use-socket';

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

function AuthenticatedContent({ children }: AuthenticatedLayoutProps): React.JSX.Element {
  // Initialize socket connection for authenticated session
  useSocket();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1">{children}</main>
      <NotificationToastContainer />
    </div>
  );
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps): React.JSX.Element {
  return (
    <AuthGuard>
      <AuthenticatedContent>{children}</AuthenticatedContent>
    </AuthGuard>
  );
}
