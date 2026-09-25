import { defineConfig } from 'vitest/config';

// Unit tests for AURA's deterministic runtime code (policy-free helpers, sandbox, workspace layout,
// terminal tickets, model chains). Never picks up Mastra's build output or dev folder.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', '.mastra/**', 'src/mastra/public/**'],
    environment: 'node',
    // Git-backed tests create real temp repositories; keep them off worker threads.
    pool: 'forks',
    testTimeout: 30_000,
  },
});
