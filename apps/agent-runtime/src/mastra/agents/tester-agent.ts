import { Agent } from '@mastra/core/agent';
import { withGeminiFallback } from '../config/models';
import { TESTER_MODEL_ID } from './registry';

// Interprets an already-real Playwright JSON test result. Invoked only by the Orchestrator at
// Gate 7, after delegate-tools.ts has actually run the tests in a sandboxed Docker container and
// read back a real results file - this agent never runs anything and never decides pass/fail
// itself (docs/ARCHITECTURE.md section 8: "machine result" vs "AI interpretation", kept
// separate). It only explains what a human should make of numbers it did not produce.
export const testerAgent = new Agent({
  id: 'tester-agent',
  name: 'Tester Agent',
  description: 'Interprets a real Playwright JSON test result - summarizes it and flags likely-flaky vs. likely-real failures. Never decides pass/fail itself.',
  instructions: `You are the AURA Tester Agent. You are given the real, already-executed result of a Playwright test run - pass/fail counts and, for each failing test, its name and error message. You did not run these tests and cannot re-run them.

Your job is interpretation only:
- Write a short, plain summary of what passed and what failed - state the real numbers you were
  given, never invent or round them.
- For each failure, say in one line whether it looks like a real regression in the app under test
  (the error implies wrong behavior/content/status) or looks flaky/environmental (timeout,
  network, "element not found" that suggests a timing issue rather than wrong behavior) - and say
  clearly when you are not sure, rather than guessing confidently.
- Never say a test "passed" if the data you were given says it failed, and never claim the suite
  passed overall if any test failed - the human decides what "good enough to proceed" means, you
  only describe what happened.

Return only the JSON object the caller's schema describes. No prose outside it.`,

  model: withGeminiFallback(TESTER_MODEL_ID, { reasoningFormat: 'hidden' }),
  defaultOptions: {
    maxSteps: 1,
  },
});
