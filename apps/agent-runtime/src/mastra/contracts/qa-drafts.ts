import { z } from 'zod';
import type { DesignDocLink, DesignDocWrite } from './drafts';
import { bullets } from './markdown';


export const scenarioTypes = ['ui', 'api'] as const;

export const testScenarioSchema = z.object({
  title: z.string().min(3).max(200).describe('Scenario title, one line'),
  type: z.enum(scenarioTypes).describe('"ui" for a browser scenario, "api" for an API scenario'),
  storyKeys: z.array(z.string().min(1)).min(1).describe('Story key(s) this scenario tests'),
  steps: z.array(z.string().min(1)).min(1).describe('Steps and expected results, specific enough to write the test from'),
  fileName: z.string().min(3).max(120).describe('Kebab-case file name for this scenario, no extension, e.g. "submit-ticket-with-valid-fields"'),
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
  '*Drafted by the AURA QA Agent: what to verify for each approved Story. The test-writer coder turns each scenario into a test on the Task branch.*';

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

// One scenario as a design document.
export function renderScenarioDoc(scenario: TestScenario): string {
  return [
    `# ${scenario.title}`,
    '',
    `**Type:** ${scenario.type.toUpperCase()} · **Tests:** ${scenario.storyKeys.join(', ')} · **Spec file:** tests/${scenario.fileName}.spec.ts`,
    '',
    '## Steps',
    '',
    bullets(scenario.steps),
  ].join('\n');
}

// Documents saved after test plan approval: the plan, and one per scenario.
export function qaDocuments(draft: QaDraft): DesignDocWrite[] {
  return [
    { kind: 'qa-plan', slug: 'qa-plan', title: `Test plan for ${draft.epicKey}`, content: renderTestPlan(draft) },
    ...draft.scenarios.map(
      (s): DesignDocWrite => ({ kind: 'qa-scenario', slug: `qa/${s.fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}`, title: s.title, content: renderScenarioDoc(s), issueKey: /^[A-Z][A-Z0-9_]*-\d+$/.test(s.storyKeys[0] ?? '') ? s.storyKeys[0] : undefined }),
    ),
  ];
}

// Jira comment on the Epic linking the saved test plan documents.
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
