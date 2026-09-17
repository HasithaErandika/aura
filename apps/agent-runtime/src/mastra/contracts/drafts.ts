import { z } from 'zod';

// Structured drafts the PO and BA agents produce. Agents propose JSON against these
// schemas; rendering for humans and filing to Jira are deterministic code, so nothing a
// human approved can drift on its way into Jira (docs/ARCHITECTURE.md section 1, principle 5).

export const priorities = ['Highest', 'High', 'Medium', 'Low', 'Lowest'] as const;

export const epicDraftSchema = z.object({
  title: z.string().min(3).max(200).describe('Epic title, one line'),
  objective: z.string().min(10).describe('Why this matters, two to four sentences'),
  scopeIn: z.array(z.string().min(1)).min(1).describe('What is included'),
  scopeOut: z.array(z.string().min(1)).describe('What is explicitly excluded'),
  stakeholders: z.array(z.string().min(1)).describe('Roles or teams affected'),
  priority: z.enum(priorities),
  successMetrics: z.array(z.string().min(1)).min(1).describe('Measurable outcomes'),
  assumptions: z.array(z.string().min(1)).describe('Assumptions and open questions'),
});
export type EpicDraft = z.infer<typeof epicDraftSchema>;

export const storyDraftSchema = z.object({
  title: z.string().min(3).max(200).describe('User story title, one line'),
  description: z.string().min(10).describe('As a <role>, I want <capability>, so that <benefit>, plus context'),
  acceptanceCriteria: z.array(z.string().min(1)).min(1).describe('Testable criteria'),
  definitionOfDone: z.array(z.string().min(1)).min(1),
  priority: z.enum(priorities),
  risks: z.array(z.string().min(1)).describe('Risks and open questions'),
});
export type StoryDraft = z.infer<typeof storyDraftSchema>;

export const storiesDraftSchema = z.object({
  epicKey: z.string().min(1),
  stories: z.array(storyDraftSchema).min(1).max(20),
  nonFunctionalRequirements: z.array(z.string().min(1)).describe('NFRs that apply across the stories'),
});
export type StoriesDraft = z.infer<typeof storiesDraftSchema>;

export type DraftKind = 'epic' | 'stories';

function bullets(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : '- none';
}

const PO_PERSPECTIVE = '*Drafted by the AURA PO Agent, from a product-ownership perspective: business value, scope, and stakeholder impact.*';
const BA_PERSPECTIVE = '*Drafted by the AURA BA Agent, from a business-analyst perspective: functional detail, testability, and delivery scope.*';

export function renderEpic(draft: EpicDraft): string {
  return [
    `# ${draft.title}`,
    '',
    PO_PERSPECTIVE,
    '',
    `**Priority:** ${draft.priority}`,
    '',
    '## Objective',
    draft.objective,
    '',
    '## Scope (in)',
    bullets(draft.scopeIn),
    '',
    '## Scope (out)',
    bullets(draft.scopeOut),
    '',
    '## Stakeholders',
    bullets(draft.stakeholders),
    '',
    '## Success metrics',
    bullets(draft.successMetrics),
    '',
    '## Assumptions and open questions',
    bullets(draft.assumptions),
  ].join('\n');
}

export function renderStory(story: StoryDraft, index?: number): string {
  const heading = index === undefined ? `# ${story.title}` : `## ${index + 1}. ${story.title}`;
  return [
    heading,
    '',
    // Only a standalone Story doc (index undefined - an individual Jira issue) carries its own
    // perspective line; inside renderStories() the list carries one at the top instead.
    ...(index === undefined ? [BA_PERSPECTIVE, ''] : []),
    `**Priority:** ${story.priority}`,
    '',
    story.description,
    '',
    '### Acceptance criteria',
    bullets(story.acceptanceCriteria),
    '',
    '### Definition of done',
    bullets(story.definitionOfDone),
    '',
    '### Risks and open questions',
    bullets(story.risks),
  ].join('\n');
}

export function renderStories(draft: StoriesDraft): string {
  return [
    `# Stories for ${draft.epicKey}`,
    '',
    BA_PERSPECTIVE,
    '',
    ...draft.stories.map((s, i) => `${renderStory(s, i)}\n`),
    '## Non-functional requirements',
    bullets(draft.nonFunctionalRequirements),
  ].join('\n');
}

// Jira description bodies. mcp-atlassian converts Markdown to Jira markup.
export function epicJiraDescription(draft: EpicDraft, stamp: string): string {
  return `${renderEpic(draft).replace(/^# .*\n\n/, '')}\n\n----\n${stamp}`;
}

export function storyJiraDescription(story: StoryDraft, nfrs: string[], stamp: string): string {
  const body = renderStory(story).replace(/^# .*\n\n/, '');
  const nfr = nfrs.length ? `\n\n### Non-functional requirements (epic-wide)\n${bullets(nfrs)}` : '';
  return `${body}${nfr}\n\n----\n${stamp}`;
}
