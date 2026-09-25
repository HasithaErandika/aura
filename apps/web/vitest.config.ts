import { defineConfig } from 'vitest/config';

// Unit tests for the web app's pure logic (e.g. project-files/access.ts). Kept separate from
// vite.config.ts so tests do not load the React/Tailwind build plugins.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
