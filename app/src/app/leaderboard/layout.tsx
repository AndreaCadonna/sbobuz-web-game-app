'use client';

import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout';

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
