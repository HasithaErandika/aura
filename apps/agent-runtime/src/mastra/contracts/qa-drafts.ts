import { z } from 'zod';

// The QA Agent's plan (Gate 6). Mirrors the Architect's draft/revise/file shape
// (contracts/drafts.ts): the agent proposes structured content, deterministic code renders and
// files it. Unlike Architect, QA's "file" writes real, runnable Playwright source files, not
// only Markdown - the test plan is a human-readable summary of the same content that becomes
// the .spec.ts files, never a separate, disconnected description of them.

export const scenarioTypes = ['ui', 'api'] as const;

export const testScenarioSchema = z.object({
  title: z.string().min(3).max(200).describe('Scenario title, one line'),
  type: z.enum(scenarioTypes).describe('"ui" for a Playwright browser scenario, "api" for a Playwright request-fixture scenario'),
  storyKeys: z.array(z.string().min(1)).min(1).describe('Story key(s) this scenario tests'),
  steps: z.array(z.string().min(1)).min(1).describe('Human-readable steps this scenario covers, for the test plan'),
  fileName: z.string().min(3).max(120).describe('Kebab-case file name for this scenario, no extension, e.g. "submit-ticket-with-valid-fields"'),
  playwrightSource: z.string().min(20).describe('Complete, runnable Playwright TypeScript test file content (@playwright/test) for this scenario - imports included'),
});
export type TestScenario = z.infer<typeof testScenarioSchema>;

export const coverageRowSchema = z.object({
  storyKey: z.string().min(1),
  covered: z.boolean().describe('Whether at least one scenario tests this Story'),
  note: z.string().describe('Why covered/not covered, one short line'),
});
export type CoverageRow = z.infer<typeof coverageRowSchema>;

export const qaDraftSchema = z.object({
  epicKey: z.string().min(1),
  summary: z.string().min(10).describe('Short summary of the test approach for this Epic'),
  coverageMatrix: z.array(coverageRowSchema).min(1),
  scenarios: z.array(testScenarioSchema).min(1).max(30),
});
export type QaDraft = z.infer<typeof qaDraftSchema>;

const QA_PERSPECTIVE =
  '*Drafted by the AURA QA Agent, from a test-coverage perspective: what to verify and how, for each approved Story - the generated Playwright source is the real test, not a description of one.*';

function bullets(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : '- none';
}

export function renderTestPlan(draft: QaDraft): string {
  return [
    `# Test plan for ${draft.epicKey}`,
    '',
    QA_PERSPECTIVE,
    '',
    draft.summary,
    '',
    '## Coverage matrix',
    '',
    ...draft.coverageMatrix.map((row) => `- **${row.storyKey}** — ${row.covered ? 'covered' : 'NOT covered'}: ${row.note}`),
    '',
    '## Scenarios',
    '',
    ...draft.scenarios.map(
      (s, i) =>
        `### ${i + 1}. ${s.title} (${s.type.toUpperCase()})\n**Tests:** ${s.storyKeys.join(', ')} · **File:** tests/${s.fileName}.spec.ts\n\n${bullets(s.steps)}\n`,
    ),
  ].join('\n');
}

// Renders the Jira comment posted on the Epic after filing the test plan - points at the QA
// workspace's real files, same pattern as architectureFiledComment.
export function qaFiledComment(draft: QaDraft, testPlanPath: string, scenarioPaths: string[], stamp: string): string {
  return [
    `AURA QA Agent filed a test plan with ${draft.scenarios.length} scenario${draft.scenarios.length === 1 ? '' : 's'} for this Epic.`,
    '',
    `Test plan and Playwright source (QA workspace for ${draft.epicKey}):`,
    `- ${testPlanPath}`,
    ...scenarioPaths.map((p) => `- ${p}`),
    '',
    '----',
    stamp,
  ].join('\n');
}
