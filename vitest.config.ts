import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['server/src/**/*.test.ts', 'shared/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/__tests__/integration/**'],
    coverage: {
      provider: 'v8',
      include: ['server/src/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/index.ts', '**/__tests__/**'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    alias: {
      '@server': new URL('./server/src', import.meta.url).pathname,
      '@shared': new URL('./shared/types', import.meta.url).pathname,
    },
  },
});
