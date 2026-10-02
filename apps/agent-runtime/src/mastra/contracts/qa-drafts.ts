import { z } from 'zod';
import type { DesignDocLink, DesignDocWrite } from './drafts';

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
  // Bumped only when the Tester Agent loop (or a human) revises this one scenario after a real
  // failure - every other scenario in the same draft keeps its own revision untouched, since the
  // loop is only ever allowed to touch the scenario that actually failed (see
  // delegate-tools/qa.ts's reviseQaScenario - it never regenerates the whole plan).
  revision: z.number().int().min(1).default(1).describe('Revision counter for this one scenario file'),
  revisionNote: z.string().nullable().default(null).describe('Why this scenario was last revised (the failure evidence that triggered it) - null for the original version'),
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
        `### ${i + 1}. ${s.title} (${s.type.toUpperCase()})\n**Tests:** ${s.storyKeys.join(', ')} · **File:** tests/${s.fileName}.spec.ts${
          s.revision > 1 ? ` · **Revision ${s.revision}** (${s.revisionNote ?? 'revised'})` : ''
        }\n\n${bullets(s.steps)}\n`,
    ),
  ].join('\n');
}

// One scenario as a design document for QA: what it tests and how, without the Playwright
// source (QA reads scenarios, not code; the spec file is reviewed in the PR).
export function renderScenarioDoc(scenario: TestScenario): string {
  return [
    `# ${scenario.title}`,
    '',
    `**Type:** ${scenario.type.toUpperCase()} · **Tests:** ${scenario.storyKeys.join(', ')} · **Spec file:** tests/${scenario.fileName}.spec.ts`,
    ...(scenario.revision > 1 ? ['', `**Revision ${scenario.revision}:** ${scenario.revisionNote ?? 'revised'}`] : []),
    '',
    '## Steps',
    '',
    bullets(scenario.steps),
  ].join('\n');
}

// The documents Gate 6 saves once the human approved the test plan: the plan, and one
// document per scenario, linked to the first Story it tests.
export function qaDocuments(draft: QaDraft): DesignDocWrite[] {
  return [
    { kind: 'qa-plan', slug: 'qa-plan', title: `Test plan for ${draft.epicKey}`, content: renderTestPlan(draft) },
    ...draft.scenarios.map(
      (s): DesignDocWrite => ({ kind: 'qa-scenario', slug: `qa/${s.fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}`, title: s.title, content: renderScenarioDoc(s), issueKey: /^[A-Z][A-Z0-9_]*-\d+$/.test(s.storyKeys[0] ?? '') ? s.storyKeys[0] : undefined }),
    ),
  ];
}

// Renders the Jira comment posted on the Epic after filing the test plan - links the saved
// documents, same pattern as architectureFiledComment.
export function qaFiledComment(draft: QaDraft, docs: DesignDocLink[], stamp: string): string {
  return [
    `AURA QA Agent filed a test plan with ${draft.scenarios.length} scenario${draft.scenarios.length === 1 ? '' : 's'} for this Epic.`,
    '',
    `Test plan and scenarios for ${draft.epicKey} (AURA web app, QA):`,
    ...docs.map((d) => `- ${d.title}: ${d.url}`),
    '',
    '----',
    stamp,
  ].join('\n');
}
