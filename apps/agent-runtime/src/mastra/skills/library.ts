// AURA's skill library (plan §7): short, tested ways of doing common coding work, loaded by the
// VS Code agent on demand with load_skill. A repository adds its own in .aura/skills/<name>/SKILL.md,
// which win over a library skill with the same name. Kept as code (not .md files) so the Mastra
// bundler ships them with the runtime.

export interface LibrarySkill {
  name: string;
  description: string;
  body: string;
}

export const SKILL_LIBRARY: readonly LibrarySkill[] = [
  {
    name: 'nestjs-module',
    description: 'Add a NestJS feature module: module, controller, service, DTOs with validation, and unit tests.',
    body: `# Add a NestJS feature module

1. Read the app's existing modules first (src/app.module.ts and one similar feature) and copy their conventions: folder layout, naming, how config and the database are injected.
2. Create src/<feature>/<feature>.module.ts, <feature>.controller.ts, <feature>.service.ts and dto/*.dto.ts. Register the module in AppModule imports.
3. DTOs use class-validator decorators; the app must have a global ValidationPipe (whitelist: true). Never accept untyped request bodies.
4. Controllers stay thin: parse, call the service, map errors to HttpExceptions (NotFoundException, ConflictException). Business logic lives in the service.
5. Add <feature>.service.spec.ts with Test.createTestingModule and mocked dependencies; cover the happy path and each error branch.
6. Run the project's checks: npm run lint, npx tsc --noEmit, npm test. Report the real output.`,
  },
  {
    name: 'react-feature',
    description: 'Add a React feature (screen or component) with typed props, loading and error states, and tests.',
    body: `# Add a React feature

1. Read how existing features are organised (src/features or src/components), how data is fetched (hooks, query library) and how routes are declared. Follow that, don't introduce a new pattern.
2. One folder per feature: the component, its hook for data, and its test. Props and API data are typed; no any.
3. Every data view has a loading, an empty and an error state. Buttons that submit are disabled while pending.
4. Accessibility: labelled inputs, buttons are <button>, images have alt text, focus is visible.
5. Test with the project's runner (Vitest or Jest + Testing Library): render, interact by role/label, assert what the user sees.
6. Run npm run lint, npx tsc --noEmit, npm test and npm run build. Report the real output.`,
  },
  {
    name: 'debug-failing-test',
    description: 'Find the root cause of a failing test from its real output before changing any code.',
    body: `# Debug a failing test

1. Run only the failing test and read the whole output: the assertion, the expected and received values, and the first stack frame in project code.
2. Decide which side is wrong: the code under test, the test, or the environment (missing env var, port in use, wrong Node/git version). Say which and why, citing the output.
3. Reproduce the smallest case: one test, one input. Add a temporary log only if the output doesn't show the value you need; remove it after.
4. Fix the cause, not the symptom. Never skip, delete or loosen a test to make it pass, and never add a retry to hide a race.
5. Re-run the failing test, then the whole suite, and report both results from real output.`,
  },
  {
    name: 'write-unit-tests',
    description: "Write focused unit tests for new or changed code, in the project's own framework and style.",
    body: `# Write unit tests

1. Find the framework and conventions from an existing test next to similar code (file naming, colocated or __tests__, mocking style).
2. Test behaviour through the public interface: inputs and outputs, thrown errors, calls to injected dependencies. Not private details.
3. One behaviour per test, named as a sentence ("rejects an expired token"). Arrange, act, assert.
4. Cover the happy path, each error branch, and the edge cases the change introduced (empty, null, boundary values).
5. Mock only what crosses a boundary (network, database, clock, file system). Use fake timers for time.
6. Run the tests and show they pass; for a bug fix, show the new test failing before the fix when practical.`,
  },
  {
    name: 'playwright-e2e',
    description: 'Write a Playwright end-to-end test for a QA scenario, with stable locators and no fixed waits.',
    body: `# Write a Playwright e2e test

1. Start from the QA scenario: its steps and expected results become the test's steps and assertions. Name the test after the scenario.
2. Locators: getByRole, getByLabel, getByText, then data-testid. Never CSS chains or nth-child.
3. Never waitForTimeout. Use auto-waiting assertions (await expect(locator).toBeVisible()) and waitForResponse when a request must finish.
4. Each test sets up its own data (API call or fixture) and doesn't depend on another test's order.
5. Run the dev server in the background (execute_command with background: true), wait for it to answer, then npx playwright test <file>. Stop the server afterwards.
6. Report the real result; on a failure, read the trace or screenshot path from the output.`,
  },
  {
    name: 'code-review',
    description: 'Review a diff for correctness, security and maintainability, with concrete findings.',
    body: `# Review a change

1. Read the Task and its acceptance criteria, then the full diff (git diff development...HEAD) and the files around each change.
2. Check, in this order: does it meet each acceptance criterion; correctness (edge cases, error handling, races); security (input validation, authorization, secrets, injection); tests (do they cover the change and would they catch a regression); maintainability (naming, duplication, fits the codebase).
3. Every finding names the file and line, what is wrong, and a concrete fix. Mark each as blocking or optional.
4. Run the checks yourself (lint, typecheck, tests) rather than trusting a claim that they pass.
5. If nothing blocks, say so plainly.`,
  },
  {
    name: 'git-hygiene',
    description: 'Branch, commit and prepare a change for its pull request the AURA way.',
    body: `# Git hygiene

1. Work on the Task branch feat/<EPIC>/<TASK> (parallel parts: feat/<EPIC>/<TASK>_s<N>), cut from development. Never commit to main or development directly.
2. Before committing: git status and git diff to see exactly what changes; no stray files, secrets, .env or build output.
3. Conventional commit subjects: feat:, fix:, test:, docs:, refactor:, chore:, with the Jira key, e.g. "feat(KAN-45): add order search". The body says why.
4. Small, coherent commits; run the project's checks before each.
5. Never force-push, never rewrite pushed history. Pull requests go into development.`,
  },
];
