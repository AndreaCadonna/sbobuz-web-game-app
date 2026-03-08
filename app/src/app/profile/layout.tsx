'use client';

import { AuthenticatedLayout } from '@/components/layout/AuthenticatedLayout';

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
