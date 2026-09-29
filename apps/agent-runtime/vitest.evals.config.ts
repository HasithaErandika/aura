import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Agent evals (src/mastra/evals/run.eval.ts): real model calls, so they read this app's .env like
// `mastra dev` does and get long timeouts. Run with `pnpm --filter agent-runtime eval`; never
// part of `make test` or CI (baselines.test.ts is the CI half).
export default defineConfig({
  test: {
    include: ['src/**/*.eval.ts'],
    environment: 'node',
    env: (() => {
      try {
        return parse(readFileSync('.env'));
      } catch {
        return {};
      }
    })(),
    testTimeout: 15 * 60_000,
    fileParallelism: false,
  },
});
