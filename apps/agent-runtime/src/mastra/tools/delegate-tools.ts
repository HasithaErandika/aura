import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  architectureDraftSchema,
  architectureFiledComment,
  architectureTaskJiraDescription,
  backendFrameworks,
  epicDraftSchema,
  epicJiraDescription,
  renderAdr,
  renderArchitecture,
  renderEpic,
  renderPlan,
  renderRequirementsDoc,
  renderStories,
  storiesDraftSchema,
  storyJiraDescription,
  type ArchitectureDocPaths,
  type ArchitectureDraft,
  type EpicDraft,
  type StoriesDraft,
} from '../contracts/drafts';
import { draftStore, type DraftRecord } from '../store/draft-store';
import { jira, jiraIssueUrl, type JiraIssueSummary } from '../mcp/jira-client';
import { PO_MODEL_ID, BA_MODEL_ID, ARCHITECT_MODEL_ID } from '../agents/registry';
import { generateObject, type MastraLike } from '../lib/generate-object';
import { architectWorkspace, type WorkspaceRegistry } from '../workspace/architect-workspace';

// Centralizes Orchestrator access to PO, BA, Architect, Jira, and Architect workspace actions 
// while storing drafts by ID to ensure approved content is filed exactly once.
const outputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional().describe('Id of the draft to pass back for revise or file.'),
  markdown: z.string().optional().describe('Human-readable draft. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  epicUrl: z.string().nullable().optional(),
  storyKeys: z.array(z.string()).optional(),
  taskKeys: z.array(z.string()).optional(),
  error: z.string().optional(),
});
type DelegateOutput = z.infer<typeof outputSchema>;

// Converts a caught error into a {ok: false, error} result.
function fail(error: unknown): DelegateOutput {
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message };
}

// Turns a title into a lowercase, hyphenated, filesystem-safe slug.
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

// Builds the "Created by / Source / Filed" provenance stamp appended to filed Jira content.
function provenance(agentLabel: string, modelId: string, draft: DraftRecord, source: string): string {
  return [
    `Created by: AURA · ${agentLabel} · ${modelId} · draft ${draft.id} v${draft.version}`,
    `Source: ${source}`,
    `Filed: ${new Date().toISOString()} (human-approved via the AURA Orchestrator)`,
  ].join('\n');
}

const poInputSchema = z
  .object({
    mode: z.enum(['draft', 'revise', 'file']),
    requirement: z.string().optional().describe('draft: the business requirement, verbatim from the user'),
    stakeholders: z.string().optional().describe('draft: stakeholder list if the user gave one'),
    draftId: z.string().optional().describe('revise and file: the draftId returned earlier'),
    feedback: z.string().optional().describe('revise: the human feedback, verbatim'),
    approved: z.boolean().optional().describe('file: must be true; set only after ask_user returned an approval'),
  })
  .strict();

export const delegateToPoTool = createTool({
  id: 'delegate_to_po',
  description:
    'PO Agent. draft: requirement -> Epic draft (returns draftId + markdown). revise: draftId + feedback -> new draftId + markdown. file: draftId + approved -> Epic created in Jira (returns epicKey). Never file without an explicit human approval.',
  inputSchema: poInputSchema,
  outputSchema,
  execute: async (input, { mastra, agent }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        // Drafts a new Epic from a business requirement.
        case 'draft': {
          if (!input.requirement?.trim()) return fail('draft needs the requirement text');
          const prompt = `Draft an Epic for this business requirement.\n\nRequirement:\n${input.requirement.trim()}${input.stakeholders ? `\n\nStakeholders given by the requester:\n${input.stakeholders}` : ''}`;
          const content = await generateObject<EpicDraft>(mastra as MastraLike, 'po', prompt, epicDraftSchema);
          const record = await draftStore.create({ kind: 'epic', content, threadId });
          return { ok: true, draftId: record.id, markdown: renderEpic(content) };
        }
        // Revises an Epic draft with feedback, syncing an already-filed Epic in Jira if present.
        case 'revise': {
          if (!input.draftId || !input.feedback?.trim()) return fail('revise needs draftId and feedback');
          const previous = await draftStore.get<EpicDraft>(input.draftId);
          if (!previous || previous.kind !== 'epic') return fail(`unknown epic draft ${input.draftId}`);
          const prompt = `Revise this Epic draft according to the feedback. Return the complete updated Epic.\n\nCurrent draft (JSON):\n${JSON.stringify(previous.content)}\n\nFeedback:\n${input.feedback.trim()}`;
          const content = await generateObject<EpicDraft>(mastra as MastraLike, 'po', prompt, epicDraftSchema);
          const record = await draftStore.create({ kind: 'epic', content, threadId, parentId: previous.id });
          if (previous.filed.epic) {
            const epicKey = previous.filed.epic;
            try {
              await jira.updateIssue(epicKey, {
                summary: content.title,
                description: epicJiraDescription(content, provenance('PO Agent', PO_MODEL_ID, record, '(free-text business requirement, no upstream Jira issue)')),
                priority: content.priority,
              });
              await jira.addComment(epicKey, `AURA PO Agent revised this Epic after human feedback:\n\n${input.feedback.trim()}`);
              await draftStore.markFiled(record.id, { epic: epicKey }, epicKey);
            } catch (error) {
              // Jira sync failed but the draft itself is saved - return draftId/markdown so it isn't lost.
              return {
                ok: false,
                draftId: record.id,
                markdown: renderEpic(content),
                epicKey,
                epicUrl: jiraIssueUrl(epicKey),
                error: `Draft revised (draftId ${record.id}), but syncing ${epicKey} in Jira failed: ${error instanceof Error ? error.message : String(error)}. Retry revise or file to sync again; nothing was created twice.`,
              };
            }
            return { ok: true, draftId: record.id, markdown: renderEpic(content), epicKey, epicUrl: jiraIssueUrl(epicKey) };
          }
          return { ok: true, draftId: record.id, markdown: renderEpic(content) };
        }
        // Files the approved Epic draft as a Jira Epic, or returns the existing one if already filed.
        case 'file': {
          if (!input.draftId) return fail('file needs draftId');
          if (input.approved !== true) return fail('file requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<EpicDraft>(input.draftId);
          if (!record || record.kind !== 'epic') return fail(`unknown epic draft ${input.draftId}`);
          if (record.filed.epic) {
            return { ok: true, epicKey: record.filed.epic, epicUrl: jiraIssueUrl(record.filed.epic), draftId: record.id };
          }
          const created = await jira.createIssue({
            summary: record.content.title,
            issueType: 'Epic',
            description: epicJiraDescription(record.content, provenance('PO Agent', PO_MODEL_ID, record, '(free-text business requirement, no upstream Jira issue)')),
            priority: record.content.priority,
          });
          await draftStore.markFiled(record.id, { epic: created.key }, created.key);
          return { ok: true, epicKey: created.key, epicUrl: created.url, draftId: record.id };
        }
      }
    } catch (error) {
      return fail(error);
    }
  },
});

const baInputSchema = z
  .object({
    mode: z.enum(['draft', 'revise', 'file']),
    epicKey: z.string().optional().describe('draft: key of the approved, filed Epic'),
    draftId: z.string().optional().describe('revise and file: the draftId returned earlier'),
    feedback: z.string().optional().describe('revise: the human feedback, verbatim'),
    approved: z.boolean().optional().describe('file: must be true; set only after ask_user returned an approval'),
  })
  .strict();

export const delegateToBaTool = createTool({
  id: 'delegate_to_ba',
  description:
    'BA Agent. draft: epicKey -> Stories draft (returns draftId + markdown). revise: draftId + feedback -> new draftId + markdown. file: draftId + approved -> Stories created in Jira under the Epic (returns storyKeys). Never file without an explicit human approval.',
  inputSchema: baInputSchema,
  outputSchema,
  execute: async (input, { mastra, agent }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        // Drafts Stories for an approved Epic.
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          if (!epicKey) return fail('draft needs the Epic key');
          const epic = await jira.getIssue(epicKey);
          if (epic.issueType && epic.issueType.toLowerCase() !== 'epic') return fail(`${epicKey} is a ${epic.issueType}, not an Epic`);
          const prompt = `Break this approved Epic into Stories. Set epicKey to "${epic.key}".\n\nEpic ${epic.key}: ${epic.summary}\nStatus: ${epic.status || 'unknown'}\n\n${epic.description || '(no description)'}`;
          const content = await generateObject<StoriesDraft>(mastra as MastraLike, 'ba', prompt, storiesDraftSchema);
          content.epicKey = epic.key;
          const record = await draftStore.create({ kind: 'stories', content, threadId, epicKey: epic.key });
          return { ok: true, draftId: record.id, markdown: renderStories(content), epicKey: epic.key };
        }
        // Revises the Stories draft with feedback, syncing any already-filed Stories in Jira.
        case 'revise': {
          if (!input.draftId || !input.feedback?.trim()) return fail('revise needs draftId and feedback');
          const previous = await draftStore.get<StoriesDraft>(input.draftId);
          if (!previous || previous.kind !== 'stories') return fail(`unknown stories draft ${input.draftId}`);
          const prompt = `Revise these Stories according to the feedback. Return the complete updated set. Keep epicKey "${previous.content.epicKey}".\n\nCurrent draft (JSON):\n${JSON.stringify(previous.content)}\n\nFeedback:\n${input.feedback.trim()}`;
          const content = await generateObject<StoriesDraft>(mastra as MastraLike, 'ba', prompt, storiesDraftSchema);
          content.epicKey = previous.content.epicKey;
          const record = await draftStore.create({ kind: 'stories', content, threadId, epicKey: previous.epicKey, parentId: previous.id });
          // Already-filed Stories get updated in place; removed stories keep their existing Jira issue untouched.
          const filedIndices = Object.keys(previous.filed).filter((k) => k !== 'comment');
          if (filedIndices.length) {
            const stamp = provenance('BA Agent', BA_MODEL_ID, record, `${previous.content.epicKey} (Epic)`);
            const carried: Record<string, string> = {};
            const syncFailures: string[] = [];
            for (const key of filedIndices) {
              const story = content.stories[Number(key)];
              const jiraKey = previous.filed[key]!;
              if (!story) continue;
              try {
                await jira.updateIssue(jiraKey, {
                  summary: story.title,
                  description: storyJiraDescription(story, content.nonFunctionalRequirements, stamp),
                  priority: story.priority,
                });
                await jira.addComment(jiraKey, `AURA BA Agent revised this Story after human feedback:\n\n${input.feedback.trim()}`);
                carried[key] = jiraKey;
              } catch (error) {
                syncFailures.push(`${jiraKey}: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
            if (Object.keys(carried).length) await draftStore.markFiled(record.id, carried);
            if (syncFailures.length) {
              // Some Jira syncs failed - report it instead of leaving those Stories silently stale.
              return {
                ok: false,
                draftId: record.id,
                markdown: renderStories(content),
                epicKey: previous.content.epicKey,
                error: `Draft revised (draftId ${record.id}), but syncing these Stories in Jira failed: ${syncFailures.join('; ')}. Retry revise or file to sync again; nothing was created twice.`,
              };
            }
          }
          return { ok: true, draftId: record.id, markdown: renderStories(content), epicKey: previous.content.epicKey };
        }
        // Files the approved Stories as Jira Stories under the Epic.
        case 'file': {
          if (!input.draftId) return fail('file needs draftId');
          if (input.approved !== true) return fail('file requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<StoriesDraft>(input.draftId);
          if (!record || record.kind !== 'stories') return fail(`unknown stories draft ${input.draftId}`);
          const epicKey = record.content.epicKey;
          const filed = { ...record.filed };
          const stamp = provenance('BA Agent', BA_MODEL_ID, record, `${epicKey} (Epic)`);
          let failure: string | null = null;
          for (let i = 0; i < record.content.stories.length; i += 1) {
            const key = String(i);
            if (filed[key]) continue;
            const story = record.content.stories[i]!;
            try {
              const created = await jira.createIssue({
                summary: story.title,
                issueType: 'Story',
                description: storyJiraDescription(story, record.content.nonFunctionalRequirements, stamp),
                priority: story.priority,
                parentKey: epicKey,
              });
              filed[key] = created.key;
              await draftStore.markFiled(record.id, filed);
            } catch (error) {
              failure = `story ${i + 1} ("${story.title}") failed: ${error instanceof Error ? error.message : String(error)}`;
              break;
            }
          }
          const storyKeys = record.content.stories.map((_, i) => filed[String(i)]).filter((k): k is string => Boolean(k));
          if (failure) {
            return { ok: false, draftId: record.id, epicKey, storyKeys, error: `${failure}. Created so far: ${storyKeys.join(', ') || 'none'}. Re-run file with the same draftId to continue; nothing is created twice.` };
          }
          if (!filed.comment) {
            try {
              await jira.addComment(epicKey, `AURA BA Agent filed ${storyKeys.length} stories after human approval: ${storyKeys.join(', ')}`);
              filed.comment = 'done';
              await draftStore.markFiled(record.id, filed);
            } catch {
              // The comment is informational; the stories are what matters.
            }
          }
          return { ok: true, draftId: record.id, epicKey, epicUrl: jiraIssueUrl(epicKey), storyKeys };
        }
      }
    } catch (error) {
      return fail(error);
    }
  },
});

const architectInputSchema = z
  .object({
    mode: z.enum(['draft', 'revise', 'file']),
    epicKeys: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe('draft: keys of the Epics whose approved Stories to design against, together, as one shared system architecture. One Epic is a single-element array.'),
    backend: z.enum(backendFrameworks).optional().describe('draft: backend framework for this design - ask the human, never assume. Frontend is always React 19 + Vite 19 and the database is always PostgreSQL.'),
    draftId: z.string().optional().describe('revise and file: the draftId returned earlier'),
    feedback: z.string().optional().describe('revise: the human feedback, verbatim'),
    approved: z.boolean().optional().describe('file: must be true; set only after ask_user returned an approval'),
  })
  .strict();

// Mirrors the Architect workflow's full state schema so `initialState` passes Mastra validation before execution.
interface ArchitectWorkflowState {
  epicKey: string;
  epicSummary: string;
  storiesText: string;
  techStackText: string;
  requirementsSummary: string;
  decomposition: string;
  apiDesign: string;
  dataDesign: string;
  securityDesign: string;
  aiDesign: string;
  deploymentAndTestingNotes: string;
}

interface ArchitectWorkflowStreamOutput {
  fullStream: AsyncIterable<{ type: string; id?: string; payload?: { status?: string; id?: string } }>;
  result: Promise<{ status: string; result?: unknown; error?: { message?: string } }>;
}
interface ArchitectWorkflowRun {
  stream: (args: { inputData: { epicKey: string; epicSummary: string; storiesText: string; techStackText: string }; initialState: ArchitectWorkflowState }) => ArchitectWorkflowStreamOutput;
}
interface ArchitectWorkflowLike {
  createRun: () => Promise<ArchitectWorkflowRun>;
}
type ArchitectMastra = (MastraLike & { getWorkflow?: (id: string) => ArchitectWorkflowLike } & Partial<WorkspaceRegistry>) | undefined;

interface ToolWriterLike {
  custom: (chunk: { type: `data-${string}`; data: unknown; transient?: boolean }) => Promise<void>;
}

// Runs the Architect Workflow, relaying each step's start/result into this tool's own stream as it goes.
async function runArchitectWorkflow(
  mastra: ArchitectMastra,
  input: { epicKey: string; epicSummary: string; storiesText: string; techStackText: string },
  writer: ToolWriterLike | undefined,
): Promise<ArchitectureDraft> {
  const workflow = mastra?.getWorkflow?.('architect-workflow');
  if (!workflow) throw new Error('architect-workflow is not registered');
  const run = await workflow.createRun();
  const streamOutput = run.stream({
    inputData: input,
    initialState: {
      epicKey: input.epicKey,
      epicSummary: input.epicSummary,
      storiesText: input.storiesText,
      techStackText: input.techStackText,
      requirementsSummary: '',
      decomposition: '',
      apiDesign: '',
      dataDesign: '',
      securityDesign: '',
      aiDesign: '',
      deploymentAndTestingNotes: '',
    },
  });
  for await (const chunk of streamOutput.fullStream) {
    if (chunk.type === 'workflow-step-start' || chunk.type === 'workflow-step-result') {
      const stepId = chunk.id ?? chunk.payload?.id;
      await writer?.custom({
        type: 'data-architect-step',
        data: { stepId, phase: chunk.type === 'workflow-step-start' ? 'start' : 'result', status: chunk.payload?.status },
        transient: true,
      });
    }
  }
  const result = await streamOutput.result;
  if (result.status !== 'success') {
    throw new Error(`architecture design failed (${result.status})${result.error?.message ? `: ${result.error.message}` : ''}`);
  }
  return result.result as ArchitectureDraft;
}

export const delegateToArchitectTool = createTool({
  id: 'delegate_to_architect',
  description:
    "Architect Agent. draft: epicKeys (one or more) + backend -> one shared architecture draft across all those Epics' Stories (decomposition, API/data/security/AI design, ADRs, tasks; returns draftId + markdown). revise: draftId + feedback -> new draftId + markdown. file: draftId + approved -> Tasks created in Jira under the first Epic and ADRs posted as a comment on every covered Epic (returns taskKeys). Never file without an explicit human approval.",
  inputSchema: architectInputSchema,
  outputSchema,
  execute: async (input, { mastra, agent, writer }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        // Drafts a shared architecture design by running the Architect Workflow against the
        // combined Stories of every given Epic. Tech stack is a human decision passed straight
        // through, never generated by the model (docs/ARCHITECTURE.md principle 5).
        case 'draft': {
          const epicKeys = [...new Set((input.epicKeys ?? []).map((k) => k.trim().toUpperCase()).filter(Boolean))];
          if (!epicKeys.length) return fail('draft needs at least one Epic key');
          if (!input.backend) return fail('draft needs a backend framework - ask the human "Spring Boot" or "NestJS" before drafting');

          const epics: JiraIssueSummary[] = [];
          for (const key of epicKeys) {
            const epic = await jira.getIssue(key);
            if (epic.issueType && epic.issueType.toLowerCase() !== 'epic') return fail(`${key} is a ${epic.issueType}, not an Epic`);
            epics.push(epic);
          }

          const storySections: string[] = [];
          for (const epic of epics) {
            const stories = await jira.getEpicStories(epic.key);
            if (!stories.length) return fail(`${epic.key} has no Stories yet - run delegate_to_ba and file Stories before designing architecture`);
            storySections.push(`### Stories for Epic ${epic.key} (${epic.summary})\n${stories.map((s) => `- ${s.key}: ${s.summary}\n${s.description || '(no description)'}`).join('\n\n')}`);
          }

          const primaryEpicKey = epics[0]!.key;
          const epicSummary = epics.map((e) => `${e.key}: ${e.summary}`).join('; ');
          const storiesText = storySections.join('\n\n');
          const techStack = { frontend: 'React 19 (Vite 19)', backend: input.backend, database: 'PostgreSQL' };
          const techStackText = `Frontend: ${techStack.frontend}. Backend: ${techStack.backend}. Database: ${techStack.database}.`;

          const workflowResult = await runArchitectWorkflow(mastra as ArchitectMastra, { epicKey: primaryEpicKey, epicSummary, storiesText, techStackText }, writer);
          const content: ArchitectureDraft = { ...workflowResult, epicKey: primaryEpicKey, relatedEpicKeys: epicKeys, techStack };
          const record = await draftStore.create({ kind: 'architecture', content, threadId, epicKey: primaryEpicKey });
          return { ok: true, draftId: record.id, markdown: renderArchitecture(content), epicKey: primaryEpicKey };
        }
        // Revises the architecture draft with feedback, syncing any already-filed tasks in Jira.
        case 'revise': {
          if (!input.draftId || !input.feedback?.trim()) return fail('revise needs draftId and feedback');
          const previous = await draftStore.get<ArchitectureDraft>(input.draftId);
          if (!previous || previous.kind !== 'architecture') return fail(`unknown architecture draft ${input.draftId}`);
          const prompt = `Revise this architecture design according to the feedback. Return the complete updated design. Keep epicKey "${previous.content.epicKey}".\n\nCurrent draft (JSON):\n${JSON.stringify(previous.content)}\n\nFeedback:\n${input.feedback.trim()}`;
          const content = await generateObject<ArchitectureDraft>(mastra as MastraLike, 'architect', prompt, architectureDraftSchema);
          // The Epic list and tech stack are human decisions, not the model's to revise - carry
          // them over unchanged regardless of what the LLM returned for these fields.
          content.epicKey = previous.content.epicKey;
          content.relatedEpicKeys = previous.content.relatedEpicKeys;
          content.techStack = previous.content.techStack;
          const record = await draftStore.create({ kind: 'architecture', content, threadId, epicKey: previous.epicKey, parentId: previous.id });
          // Already-filed tasks get updated in place; removed tasks keep their existing Jira issue untouched.
          const filedIndices = Object.keys(previous.filed).filter((k) => k !== 'adrComment');
          if (filedIndices.length) {
            const stamp = provenance('Architect Agent', ARCHITECT_MODEL_ID, record, `${previous.content.epicKey} (Epic)`);
            const carried: Record<string, string> = {};
            const syncFailures: string[] = [];
            for (const key of filedIndices) {
              const task = content.tasks[Number(key)];
              const jiraKey = previous.filed[key]!;
              if (!task) continue;
              try {
                await jira.updateIssue(jiraKey, {
                  summary: task.title,
                  description: architectureTaskJiraDescription(task, stamp),
                  priority: task.priority,
                });
                await jira.addComment(jiraKey, `AURA Architect Agent revised this task after human feedback:\n\n${input.feedback.trim()}`);
                carried[key] = jiraKey;
              } catch (error) {
                syncFailures.push(`${jiraKey}: ${error instanceof Error ? error.message : String(error)}`);
              }
            }
            if (Object.keys(carried).length) await draftStore.markFiled(record.id, carried);
            if (syncFailures.length) {
              return {
                ok: false,
                draftId: record.id,
                markdown: renderArchitecture(content),
                epicKey: previous.content.epicKey,
                error: `Draft revised (draftId ${record.id}), but syncing these tasks in Jira failed: ${syncFailures.join('; ')}. Retry revise or file to sync again; nothing was created twice.`,
              };
            }
          }
          return { ok: true, draftId: record.id, markdown: renderArchitecture(content), epicKey: previous.content.epicKey };
        }
        // Files the approved tasks in Jira and writes the design documents to the Architect workspace.
        case 'file': {
          if (!input.draftId) return fail('file needs draftId');
          if (input.approved !== true) return fail('file requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<ArchitectureDraft>(input.draftId);
          if (!record || record.kind !== 'architecture') return fail(`unknown architecture draft ${input.draftId}`);
          const epicKey = record.content.epicKey;
          const filed = { ...record.filed };
          const stamp = provenance('Architect Agent', ARCHITECT_MODEL_ID, record, `${epicKey} (Epic)`);

          // Writes the design documents to the workspace once, after approval.
          const docPaths: ArchitectureDocPaths = {
            requirements: 'docs/srs/requirements-analysis.md',
            architecture: 'architecture.md',
            plan: 'plan.md',
            adrs: record.content.adrs.map((adr, i) => `docs/adr/${String(i + 1).padStart(4, '0')}-${slugify(adr.title)}.md`),
          };
          if (!filed.workspaceWritten) {
            const workspaceRegistry = mastra as ArchitectMastra;
            if (!workspaceRegistry?.listWorkspaces || !workspaceRegistry.addWorkspace) throw new Error('Mastra workspace registry is not available');
            const fs = architectWorkspace(workspaceRegistry as WorkspaceRegistry, epicKey).filesystem;
            if (!fs) throw new Error('Architect workspace filesystem is not available');
            await fs.writeFile(docPaths.architecture, renderArchitecture(record.content), { recursive: true, overwrite: true });
            await fs.writeFile(docPaths.requirements, renderRequirementsDoc(record.content), { recursive: true, overwrite: true });
            await fs.writeFile(docPaths.plan, renderPlan(record.content), { recursive: true, overwrite: true });
            for (let i = 0; i < record.content.adrs.length; i += 1) {
              const body = renderAdr(record.content.adrs[i]!, i).replace(/^## /, '# ');
              await fs.writeFile(docPaths.adrs[i]!, body, { recursive: true, overwrite: true });
            }
            filed.workspaceWritten = 'done';
            await draftStore.markFiled(record.id, filed);
          }

          let failure: string | null = null;
          for (let i = 0; i < record.content.tasks.length; i += 1) {
            const key = String(i);
            if (filed[key]) continue;
            const task = record.content.tasks[i]!;
            try {
              const created = await jira.createIssue({
                summary: task.title,
                issueType: 'Task',
                description: architectureTaskJiraDescription(task, stamp),
                priority: task.priority,
                parentKey: epicKey,
              });
              filed[key] = created.key;
              await draftStore.markFiled(record.id, filed);
            } catch (error) {
              failure = `task ${i + 1} ("${task.title}") failed: ${error instanceof Error ? error.message : String(error)}`;
              break;
            }
          }
          const taskKeys = record.content.tasks.map((_, i) => filed[String(i)]).filter((k): k is string => Boolean(k));
          if (failure) {
            return { ok: false, draftId: record.id, epicKey, taskKeys, error: `${failure}. Created so far: ${taskKeys.join(', ') || 'none'}. Re-run file with the same draftId to continue; nothing is created twice.` };
          }
          if (!filed.adrComment) {
            try {
              // Posted on every Epic the design covers, not just the primary one that holds
              // the filed Tasks - a human reading any of the combined Epics finds it.
              const comment = architectureFiledComment(record.content, docPaths, stamp);
              const relatedEpicKeys = record.content.relatedEpicKeys?.length ? record.content.relatedEpicKeys : [epicKey];
              for (const key of relatedEpicKeys) {
                await jira.addComment(key, comment);
              }
              filed.adrComment = 'done';
              await draftStore.markFiled(record.id, filed);
            } catch {
              // The comment is informational; the tasks and documents are what matters.
            }
          }
          return { ok: true, draftId: record.id, epicKey, epicUrl: jiraIssueUrl(epicKey), taskKeys };
        }
      }
    } catch (error) {
      return fail(error);
    }
  },
});
