import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Sbobuz - Card Game',
  description: 'A turn-based card game for 2-5 players',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)] antialiased">
        {children}
      </body>
    </html>
  );
}
