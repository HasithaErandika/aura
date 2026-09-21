import { z } from 'zod';

// Structured drafts the PO and BA and Architect agents produce. Agents propose JSON against these
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

export const disciplines = ['Frontend', 'Backend', 'Data', 'AI', 'Integration', 'Deployment'] as const;

export const adrSchema = z.object({
  title: z.string().min(3).max(200).describe('ADR title, one line, starting with a verb (e.g. "Use ...")'),
  context: z.string().min(10).describe('The forces at play: why a decision is needed now'),
  decision: z.string().min(10).describe('What was decided, stated plainly'),
  consequences: z.array(z.string().min(1)).min(1).describe('Trade-offs accepted, both positive and negative'),
});
export type Adr = z.infer<typeof adrSchema>;

export const taskEstimates = ['XS', 'S', 'M', 'L', 'XL'] as const;

export const architectureTaskSchema = z.object({
  title: z.string().min(3).max(200).describe('Task title, one line'),
  discipline: z.enum(disciplines),
  description: z.string().min(10).describe('What to build and why, enough for the assigned Dev agent or engineer to start'),
  acceptanceCriteria: z.array(z.string().min(1)).min(1).describe('Testable criteria'),
  priority: z.enum(priorities),
  estimate: z.enum(taskEstimates).describe('Rough effort t-shirt size from the architecture side only, not a developer commitment'),
  relatedStories: z.array(z.string().min(1)).describe('Story keys (e.g. AURA-43) this task implements'),
});
export type ArchitectureTask = z.infer<typeof architectureTaskSchema>;

export const backendFrameworks = ['Spring Boot', 'NestJS'] as const;

// Plain strings, not an enum: the human's choice is validated once, at the point of decision
// (delegate-tools.ts's architectInputSchema, against `backendFrameworks`). This schema only
// describes an already-decided value flowing through the workflow and draft store, and must
// stay parseable for the placeholder the workflow returns before delegate-tools.ts overwrites
// it with the real, human-chosen stack.
export const techStackSchema = z.object({
  frontend: z.string().describe('Always "React 19 (Vite 19)" - fixed, not a human choice'),
  backend: z.string().describe('Chosen by the human before drafting, from backendFrameworks; never invented by the model'),
  database: z.string().describe('Always "PostgreSQL" - fixed, not a human choice'),
});
export type TechStack = z.infer<typeof techStackSchema>;

export const architectureDraftSchema = z.object({
  epicKey: z.string().min(1).describe('The primary/lead Epic - where architecture Tasks are filed and the workspace lives'),
  relatedEpicKeys: z.array(z.string().min(1)).min(1).describe('Every Epic this shared design covers, including epicKey'),
  techStack: techStackSchema,
  requirementsSummary: z.string().min(10).describe('Cross-story synthesis of the functional and non-functional requirement themes driving this design'),
  decomposition: z.string().min(10).describe('System decomposition: components/services and how they fit together'),
  apiDesign: z.string().min(10).describe('Endpoints, contracts, versioning approach'),
  dataDesign: z.string().min(10).describe('Schema, storage choices, migrations needed'),
  securityDesign: z.string().min(10).describe('AuthN/AuthZ, data protection, risk tier of new tools or endpoints'),
  aiDesign: z.string().describe('Agent/LLM-specific design notes; empty string if this Epic has none'),
  deploymentAndTestingNotes: z.string().min(10).describe('Rollout approach and what needs test coverage'),
  adrs: z.array(adrSchema).min(1).max(10),
  tasks: z.array(architectureTaskSchema).min(1).max(30),
});
export type ArchitectureDraft = z.infer<typeof architectureDraftSchema>;

export type DraftKind = 'epic' | 'stories' | 'architecture' | 'dev-scaffold' | 'coding-task' | 'qa-plan' | 'test-run' | 'deploy-plan' | 'git-op';

// Renders a bullet list, or a placeholder line when empty.
function bullets(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : '- none';
}

const PO_PERSPECTIVE = '*Drafted by the AURA PO Agent, from a product-ownership perspective: business value, scope, and stakeholder impact.*';
const BA_PERSPECTIVE = '*Drafted by the AURA BA Agent, from a business-analyst perspective: functional detail, testability, and delivery scope.*';
const ARCHITECT_PERSPECTIVE = '*Drafted by the AURA Architect Agent, from a technical-design perspective: decomposition, API/data/security shape, and delivery tasks.*';

// Renders an Epic draft as Markdown for the human approval gate.
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

// Renders a single Story as Markdown, standalone or numbered within a list.
export function renderStory(story: StoryDraft, index?: number): string {
  const heading = index === undefined ? `# ${story.title}` : `## ${index + 1}. ${story.title}`;
  return [
    heading,
    '',
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

// Renders all Stories for an Epic as Markdown for the human approval gate.
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

// Renders one ADR as a Markdown section.
export function renderAdr(adr: Adr, index: number): string {
  return [
    `## ADR-${index + 1}. ${adr.title}`,
    '',
    '**Context**',
    adr.context,
    '',
    '**Decision**',
    adr.decision,
    '',
    '**Consequences**',
    bullets(adr.consequences),
  ].join('\n');
}

// Renders a single architecture task as Markdown, standalone or numbered within a list.
export function renderArchitectureTask(task: ArchitectureTask, index?: number): string {
  const heading = index === undefined ? `# ${task.title}` : `## ${index + 1}. ${task.title}`;
  return [
    heading,
    '',
    `**Discipline:** ${task.discipline} · **Priority:** ${task.priority} · **Estimate:** ${task.estimate}`,
    task.relatedStories.length ? `**Implements:** ${task.relatedStories.join(', ')}` : '',
    '',
    task.description,
    '',
    '### Acceptance criteria',
    bullets(task.acceptanceCriteria),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

// "KAN-3" alone, or "KAN-3 (+ KAN-8, KAN-14)" when the design spans more than one Epic.
function epicsHeading(draft: ArchitectureDraft): string {
  const others = draft.relatedEpicKeys.filter((k) => k !== draft.epicKey);
  return others.length ? `${draft.epicKey} (+ ${others.join(', ')})` : draft.epicKey;
}

// Renders the full architecture draft as Markdown for the human approval gate.
export function renderArchitecture(draft: ArchitectureDraft): string {
  return [
    `# Architecture for ${epicsHeading(draft)}`,
    '',
    ARCHITECT_PERSPECTIVE,
    '',
    ...(draft.relatedEpicKeys.length > 1 ? ['## Epics covered', bullets(draft.relatedEpicKeys), ''] : []),
    '## Technology stack',
    `- **Frontend:** ${draft.techStack.frontend}`,
    `- **Backend:** ${draft.techStack.backend}`,
    `- **Database:** ${draft.techStack.database}`,
    '',
    '## Requirements summary',
    draft.requirementsSummary,
    '',
    '## System decomposition',
    draft.decomposition,
    '',
    '## API design',
    draft.apiDesign,
    '',
    '## Data design',
    draft.dataDesign,
    '',
    '## Security design',
    draft.securityDesign,
    ...(draft.aiDesign.trim() ? ['', '## AI design', draft.aiDesign] : []),
    '',
    '## Deployment and testing notes',
    draft.deploymentAndTestingNotes,
    '',
    '## Architecture Decision Records',
    '',
    draft.adrs.map((adr, i) => renderAdr(adr, i)).join('\n\n'),
    '',
    '## Architecture tasks',
    '',
    draft.tasks.map((t, i) => `${renderArchitectureTask(t, i)}\n`).join('\n'),
  ].join('\n');
}

// Renders an Epic as a Jira issue description with a provenance stamp appended.
export function epicJiraDescription(draft: EpicDraft, stamp: string): string {
  return `${renderEpic(draft).replace(/^# .*\n\n/, '')}\n\n----\n${stamp}`;
}

// Renders a Story as a Jira issue description with epic-wide NFRs and a provenance stamp appended.
export function storyJiraDescription(story: StoryDraft, nfrs: string[], stamp: string): string {
  const body = renderStory(story).replace(/^# .*\n\n/, '');
  const nfr = nfrs.length ? `\n\n### Non-functional requirements (epic-wide)\n${bullets(nfrs)}` : '';
  return `${body}${nfr}\n\n----\n${stamp}`;
}

// Renders an architecture task as a Jira issue description with a provenance stamp appended.
export function architectureTaskJiraDescription(task: ArchitectureTask, stamp: string): string {
  const body = renderArchitectureTask(task).replace(/^# .*\n\n/, '');
  return `${body}\n\n----\n${stamp}`;
}

// Renders the Architect's requirements-analysis document for the workspace.
export function renderRequirementsDoc(draft: ArchitectureDraft): string {
  return [`# Requirements analysis for ${epicsHeading(draft)}`, '', ARCHITECT_PERSPECTIVE, '', draft.requirementsSummary].join('\n');
}

// Renders a human-readable delivery plan mirroring the filed Jira tasks.
export function renderPlan(draft: ArchitectureDraft): string {
  return [
    `# Delivery plan for ${epicsHeading(draft)}`,
    '',
    ARCHITECT_PERSPECTIVE,
    '',
    '## Deployment and testing notes',
    draft.deploymentAndTestingNotes,
    '',
    '## Tasks',
    '',
    draft.tasks.map((t, i) => `${i + 1}. **[${t.discipline}]** ${t.title} (${t.priority}, est. ${t.estimate})${t.relatedStories.length ? ` - implements ${t.relatedStories.join(', ')}` : ''}`).join('\n'),
  ].join('\n');
}

// Workspace file paths this Epic's design documents were written to, relative to the
// Architect's per-Epic workspace root (architectWorkspace(epicKey)).
export interface ArchitectureDocPaths {
  requirements: string;
  architecture: string;
  plan: string;
  adrs: string[];
}

// Renders the Jira comment pointing at the Architect workspace's design documents. Posted on
// every Epic the design covers (relatedEpicKeys), not just the primary one that holds the
// filed Tasks and the workspace files, so a human reading any of the combined Epics finds it.
export function architectureFiledComment(draft: ArchitectureDraft, paths: ArchitectureDocPaths, stamp: string): string {
  const scopeNote = draft.relatedEpicKeys.length > 1 ? ` This is a shared design across ${draft.relatedEpicKeys.join(', ')}; Tasks are filed under ${draft.epicKey}.` : '';
  return [
    `AURA Architect Agent filed ${draft.tasks.length} architecture task${draft.tasks.length === 1 ? '' : 's'} and ${draft.adrs.length} ADR${draft.adrs.length === 1 ? '' : 's'}.${scopeNote}`,
    '',
    `Design documents (Architect workspace for ${draft.epicKey}):`,
    `- ${paths.architecture}`,
    `- ${paths.requirements}`,
    `- ${paths.plan}`,
    ...paths.adrs.map((p) => `- ${p}`),
    '',
    '----',
    stamp,
  ].join('\n');
}
