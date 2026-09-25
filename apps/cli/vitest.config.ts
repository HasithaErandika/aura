import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    environment: 'node',
    // Some tests change the working directory (process.chdir), which worker threads do not allow.
    pool: 'forks',
  },
});
