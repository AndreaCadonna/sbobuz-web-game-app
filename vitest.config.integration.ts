import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['server/src/**/__tests__/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    alias: {
      '@server': new URL('./server/src', import.meta.url).pathname,
      '@shared': new URL('./shared/types', import.meta.url).pathname,
    },
  },
});
