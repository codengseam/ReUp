import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'scripts/**/*.test.{mjs,js}',
    ],
    exclude: [
      'node_modules',
      '.next',
      '.trae',
      '.qoder',
      '.cozeproj',
      'dist',
    ],
    coverage: {
      provider: 'v8',
      // Baseline thresholds set just below current coverage to act as regression
      // gates. Target is 80% lines; low-coverage legacy files (llm-client.ts,
      // rag/route.ts) are tracked for improvement.
      thresholds: {
        'src/server/**/*': { lines: 78, functions: 78, branches: 62 },
        'src/features/**/*': { lines: 80, functions: 80, branches: 75 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
