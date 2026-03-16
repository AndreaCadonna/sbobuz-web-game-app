'use client';

import { AppHeader } from '@/components/layout/AppHeader';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { NotificationToastContainer } from '@/components/ui/NotificationToast';
import { useSocket } from '@/hooks/use-socket';

/**
 * Game layout — hides the AppHeader on mobile to maximize play area.
 * On desktop (sm+), the full header is shown.
 */
function GameContent({ children }: { children: React.ReactNode }): React.JSX.Element {
  useSocket();

  return (
    <div className="flex h-screen flex-col">
      {/* Desktop-only header */}
      <div className="hidden sm:block">
        <AppHeader />
      </div>
      <main className="flex-1 min-h-0">{children}</main>
      <NotificationToastContainer />
    </div>
  );
}

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <AuthGuard>
      <GameContent>{children}</GameContent>
    </AuthGuard>
  );
}
