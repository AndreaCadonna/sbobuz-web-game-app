/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@sbobuz/shared'],
  async headers() {
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3000';
    // Derive WebSocket URL from socket URL (http->ws, https->wss)
    const wsUrl = socketUrl.replace(/^http/, 'ws');

    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      `connect-src 'self' ${apiUrl} ${socketUrl} ${wsUrl}`,
      "img-src 'self' data:",
      "font-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
