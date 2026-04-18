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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body className="min-h-screen font-body text-ink antialiased">{children}</body>
    </html>
  );
}
