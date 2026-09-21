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
import { devScaffoldFiledComment, renderDevScaffoldPlan, scaffoldDisciplines, type DevScaffoldDraft } from '../contracts/dev-drafts';
import { codingFiledComment, codingProviderLabel, codingProviders, renderCodingPlan, type CodingProvider, type CodingTaskDraft } from '../contracts/coding-drafts';
import { qaDraftSchema, qaFiledComment, renderTestPlan, type QaDraft } from '../contracts/qa-drafts';
import { deployDraftSchema, deployFiledComment, renderDeployPlan, type DeployDraft } from '../contracts/deploy-drafts';
import { gitOps, gitOpFiledComment, renderGitOpPlan, type GitOpDraft } from '../contracts/git-drafts';
import { draftStore, type DraftRecord } from '../store/draft-store';
import { jira, jiraIssueUrl, type JiraIssueSummary } from '../mcp/jira-client';
import { PO_MODEL_ID, BA_MODEL_ID, ARCHITECT_MODEL_ID, DEV_MODEL_ID, QA_MODEL_ID, TESTER_MODEL_ID, DEPLOYER_MODEL_ID } from '../agents/registry';
import { generateObject, type MastraLike } from '../lib/generate-object';
import { architectWorkspace, type WorkspaceRegistry } from '../workspace/architect-workspace';
import { qaWorkspace, qaWorkspaceRoot } from '../workspace/qa-workspace';
import { devWorkspaceDir } from '../workspace/dev-workspace';
import { isDockerAvailable, runInContainer } from '../lib/docker-exec';
import { createCodingAgent } from '../agents/mastra-coding-agent';
import { readdir, writeFile, readFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

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

interface ScaffoldEntry {
  image: string;
  command: string;
  description: string;
}

// Fixed, code-defined scaffold commands per discipline - never chosen or written by a model
// (docs/adr/0001-dev-agent-scaffold-and-template-strategy.md). Verified working (real Docker
// run, exit 0, files on disk): Frontend, Backend/NestJS. Not yet implemented - each fails
// clearly rather than silently doing nothing when asked for: Backend/Spring Boot (needs a JDK
// image and Spring Initializr network access, neither exercised yet), Data (the ADR's open
// sub-decision on Postgres provisioning is still open), AI, Integration, and "Security" (not a
// discipline architecture Tasks carry at all - security is the Architect's securityDesign
// section, implemented as part of whichever Task addresses it, not a separate scaffold; ask if
// something more specific is meant here before one is invented).
const SCAFFOLD_COMMANDS: Partial<Record<Exclude<(typeof scaffoldDisciplines)[number], 'Backend'>, ScaffoldEntry>> = {
  Frontend: {
    image: 'node:22-slim',
    command: 'npm create vite@latest . -- --template react-ts && npm install',
    description: 'React 19 + Vite 19 starter (npm create vite@latest, template react-ts), then npm install - the fixed frontend stack decided at Gate 3.',
  },
};

// Backend depends on the framework chosen at Gate 3 (techStack.backend on the Epic's
// architecture draft), so it is resolved separately from the fixed table above.
const BACKEND_SCAFFOLDS: Partial<Record<'Spring Boot' | 'NestJS', ScaffoldEntry>> = {
  NestJS: {
    image: 'node:22-slim',
    // Root cause of the "Cannot read properties of null (reading 'edgesOut')" crash: it's
    // node:22-slim's bundled npm 10.9.8 arborist itself - reproduces on a plain `npm install`
    // in a freshly scaffolded project, npx not involved. Fixed by upgrading npm before
    // scaffolding. The container runs as the host UID (docker-exec.ts), so a plain
    // `npm install -g` would fail with EACCES against the root-owned default prefix
    // (/usr/local/lib/node_modules) - point the global prefix at a writable path first.
    // Verified with two real Docker runs, exit 0, dependencies installed, files on disk.
    command:
      'npm config set prefix /tmp/npm-global && export PATH=/tmp/npm-global/bin:$PATH && npm install -g npm@latest @nestjs/cli --silent && nest new . --package-manager npm --skip-git --language TS',
    description: 'NestJS starter (@nestjs/cli new), TypeScript, npm - the backend framework chosen at Gate 3.',
  },
};

// Resolves the fixed scaffold for a Task's discipline, reading the Epic's stored tech-stack
// choice for Backend. Returns an error string, never throws - draft mode turns it into a
// plain devFail() the same way any other input problem is reported.
async function resolveScaffold(discipline: (typeof scaffoldDisciplines)[number], epicKey: string): Promise<{ entry: ScaffoldEntry } | { error: string }> {
  if (discipline === 'Backend') {
    const archDraft = await draftStore.latestByEpic<ArchitectureDraft>('architecture', epicKey);
    const backend = archDraft?.content.techStack.backend;
    const entry = backend ? BACKEND_SCAFFOLDS[backend as 'Spring Boot' | 'NestJS'] : undefined;
    if (!entry) return { error: `No scaffold is implemented for Backend/${backend ?? 'unknown'} yet - see docs/adr/0001-dev-agent-scaffold-and-template-strategy.md` };
    return { entry };
  }
  const entry = SCAFFOLD_COMMANDS[discipline];
  if (!entry) return { error: `No scaffold is implemented for ${discipline} yet - see docs/adr/0001-dev-agent-scaffold-and-template-strategy.md` };
  return { entry };
}

// Architecture Tasks always render "**Discipline:** X" in this exact form
// (contracts/drafts.ts's renderArchitectureTask) - AURA's own deterministic formatting, not
// free human prose, so parsing it back out here is reliable rather than fragile.
function disciplineFromTask(description: string): (typeof scaffoldDisciplines)[number] | null {
  const match = /\*\*Discipline:\*\*\s*(\w+)/.exec(description);
  const value = match?.[1];
  return value && (scaffoldDisciplines as readonly string[]).includes(value) ? (value as (typeof scaffoldDisciplines)[number]) : null;
}

const devInputSchema = z
  .object({
    mode: z.enum(['draft', 'execute']),
    epicKey: z.string().optional().describe('draft: the Epic this Task belongs to'),
    taskKey: z.string().optional().describe('draft: the Jira Task key to scaffold (an approved architecture Task)'),
    draftId: z.string().optional().describe('execute: the draftId returned by draft'),
    approved: z.boolean().optional().describe('execute: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const devOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable draft. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  taskKey: z.string().optional(),
  targetDir: z.string().optional(),
  exitCode: z.number().optional(),
  error: z.string().optional(),
});

function devFail(error: unknown): z.infer<typeof devOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export const delegateToDevTool = createTool({
  id: 'delegate_to_dev',
  description:
    "Dev Agent. draft: epicKey + taskKey -> reads the Task's discipline and a scaffold plan for it (Frontend and Backend/NestJS implemented; others fail clearly - returns draftId + markdown). execute: draftId + approved -> runs the fixed scaffold command in a sandboxed Docker container, moves the Task to In Progress, and comments the result (returns targetDir + exitCode). Never execute without an explicit human approval.",
  inputSchema: devInputSchema,
  outputSchema: devOutputSchema,
  execute: async (input, { mastra, agent, writer }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        // Builds the plan: picks the (fixed) command for the Task's discipline and asks the
        // Dev agent for a short explanation. Chooses no command itself beyond the lookup.
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const taskKey = input.taskKey?.trim().toUpperCase();
          if (!epicKey || !taskKey) return devFail('draft needs both epicKey and taskKey');
          const task = await jira.getIssue(taskKey);
          if (task.issueType && task.issueType.toLowerCase() !== 'task') return devFail(`${taskKey} is a ${task.issueType}, not a Task`);

          const discipline = disciplineFromTask(task.description || '');
          if (!discipline) return devFail(`Could not read a discipline off ${taskKey} - it should carry "**Discipline:** <name>" (delegate_to_architect's filed Tasks always do)`);

          const resolved = await resolveScaffold(discipline, epicKey);
          if ('error' in resolved) return devFail(resolved.error);
          const scaffold = resolved.entry;

          const targetDir = await devWorkspaceDir(epicKey, discipline);
          const prompt = `Task ${taskKey}: ${task.summary}\n\n${task.description || '(no description)'}\n\nDiscipline: ${discipline}\nWill run: ${scaffold.description}\nTarget directory: ${targetDir}\n\nReturn only the JSON the schema describes.`;
          const { summary } = await generateObject(mastra as MastraLike, 'dev', prompt, z.object({ summary: z.string().min(10) }));

          const content: DevScaffoldDraft = {
            epicKey,
            taskKey,
            discipline,
            targetDir,
            image: scaffold.image,
            command: scaffold.command,
            commandDescription: scaffold.description,
            summary,
          };
          const record = await draftStore.create({ kind: 'dev-scaffold', content, threadId, epicKey });
          return { ok: true, draftId: record.id, markdown: renderDevScaffoldPlan(content), epicKey, taskKey };
        }
        // Runs the fixed command for the drafted discipline inside a sandboxed container, then
        // comments the result on the Task. Idempotent: a draft already executed just reports
        // its prior result instead of running again.
        case 'execute': {
          if (!input.draftId) return devFail('execute needs draftId');
          if (input.approved !== true) return devFail('execute requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<DevScaffoldDraft>(input.draftId);
          if (!record || record.kind !== 'dev-scaffold') return devFail(`unknown dev scaffold draft ${input.draftId}`);

          if (record.filed.status === 'done') {
            return {
              ok: true,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              targetDir: record.content.targetDir,
              exitCode: Number(record.filed.exitCode ?? '0'),
              markdown: `Already scaffolded (exit code ${record.filed.exitCode ?? '0'}). Nothing was run twice.`,
            };
          }

          if (!(await isDockerAvailable())) return devFail('Docker is not available - install/start Docker to run scaffolds (docs/adr/0001-dev-agent-scaffold-and-template-strategy.md)');

          // Marks the Task "In Progress" as work starts - best-effort, since Jira's own
          // workflow may not have a transition of that exact name, and a missing status move
          // must never block the scaffold itself from running.
          try {
            const transitions = await jira.getTransitions(record.content.taskKey);
            const inProgress = transitions.find((t) => t.name.toLowerCase() === 'in progress');
            if (inProgress) await jira.transitionIssue(record.content.taskKey, inProgress.id);
          } catch {
            // Best-effort; proceed regardless.
          }

          let result: { exitCode: number; output: string };
          try {
            result = await runInContainer({
              image: record.content.image,
              hostDir: record.content.targetDir,
              command: record.content.command,
              timeoutMs: 5 * 60_000,
              name: `aura-dev-${record.id}`,
              labels: { 'aura.epic': record.content.epicKey, 'aura.task': record.content.taskKey, 'aura.kind': 'dev-scaffold' },
              onOutput: (chunk) => {
                void writer?.custom({ type: 'data-dev-output', data: { chunk }, transient: true });
              },
            });
          } catch (error) {
            return devFail(error);
          }

          await draftStore.markFiled(record.id, { status: 'done', exitCode: String(result.exitCode) });
          const stamp = provenance('Dev Agent', DEV_MODEL_ID, record, `${record.content.taskKey} (Task)`);
          try {
            await jira.addComment(record.content.taskKey, devScaffoldFiledComment(record.content, result.exitCode, result.output, stamp));
          } catch {
            // The comment is informational; the scaffold on disk is what matters.
          }

          if (result.exitCode !== 0) {
            return {
              ok: false,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              exitCode: result.exitCode,
              error: `Scaffold failed (exit code ${result.exitCode}). Last output:\n${result.output.slice(-2000)}`,
            };
          }
          return {
            ok: true,
            draftId: record.id,
            epicKey: record.content.epicKey,
            taskKey: record.content.taskKey,
            targetDir: record.content.targetDir,
            exitCode: result.exitCode,
            markdown: `Scaffold complete at ${record.content.targetDir}.`,
          };
        }
      }
    } catch (error) {
      return devFail(error);
    }
  },
});

// Filename the coding prompt is written to inside the target directory before the container
// starts, so it only ever exists as file content - never interpolated into a shell string
// built from Task text (see CODING_COMMANDS' "$(cat ...)" below, a safe, non-recursive shell
// substitution: it captures the file's bytes as one literal argument, it does not re-evaluate
// anything inside them).
const PROMPT_FILE = '.aura-task-prompt.txt';

// Fixed, code-defined invocations per coding CLI - never chosen or written by a model. Flags
// verified against each tool's real `--help` output, not assumed. Both already run inside
// AURA's own Docker sandbox, so each is told not to layer its own interactive approval on top:
// Claude Code's `--dangerously-skip-permissions` bypasses its prompt-per-edit flow; Codex's
// `--sandbox workspace-write --ask-for-approval never` is the less blunt equivalent - Codex
// offers a tiered sandbox rather than only an all-or-nothing bypass, so that is preferred here
// over its own `--dangerously-bypass-approvals-and-sandbox`.
// Claude Code and Codex authenticate via their own CLI login (a browser/OAuth flow run once,
// interactively, outside AURA - `claude login` / `codex login`), not an API key. AURA never
// asks for or stores a key for either: it mounts the developer's own already-logged-in
// credential file from the host running agent-runtime (read-only) into the sandbox, so the CLI
// inside the container is authenticated as whoever is running AURA - the same "runs as the
// host user" trust boundary docker-exec.ts already uses for file ownership.
const CODING_COMMANDS: Record<Exclude<CodingProvider, 'mastra'>, { image: string; command: string; hostCredential: string; containerCredential: string; loginHint: string }> = {
  anthropic: {
    image: 'node:22-slim',
    command: `npm install -g @anthropic-ai/claude-code --silent && claude -p --dangerously-skip-permissions --output-format json "$(cat ${PROMPT_FILE})"`,
    hostCredential: path.join(os.homedir(), '.claude', '.credentials.json'),
    containerCredential: '/tmp/.claude/.credentials.json',
    loginHint: 'Run `claude login` on this machine (the one running agent-runtime), then approve this again.',
  },
  openai: {
    image: 'node:22-slim',
    command: `npm install -g @openai/codex --silent && codex exec --sandbox workspace-write --ask-for-approval never --json "$(cat ${PROMPT_FILE})"`,
    hostCredential: path.join(os.homedir(), '.codex', 'auth.json'),
    containerCredential: '/tmp/.codex/auth.json',
    loginHint: 'Run `codex login` on this machine (the one running agent-runtime), then approve this again.',
  },
};

const codingInputSchema = z
  .object({
    mode: z.enum(['draft', 'execute']),
    epicKey: z.string().optional().describe('draft: the Epic this Task belongs to'),
    taskKey: z.string().optional().describe('draft: the Jira Task key to implement (must already be scaffolded via delegate_to_dev)'),
    provider: z.enum(codingProviders).optional().describe('draft: which coding agent to use - "mastra" (AURA\'s own built-in agent) is the main option; "anthropic" (Claude Code) and "openai" (Codex) are available if the human specifically wants them. Ask the human, never assume.'),
    draftId: z.string().optional().describe('execute: the draftId returned by draft'),
    approved: z.boolean().optional().describe('execute: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const codingOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable draft. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  taskKey: z.string().optional(),
  targetDir: z.string().optional(),
  exitCode: z.number().optional(),
  error: z.string().optional(),
});

function codeFail(error: unknown): z.infer<typeof codingOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export const delegateToCodeTool = createTool({
  id: 'delegate_to_code',
  description:
    "Coding Agent. 'mastra' (AURA's own built-in agent, always available) is the main option - use it unless the human asks for Claude Code or Codex specifically. draft: epicKey + taskKey + provider ('mastra' for AURA's own built-in agent, 'anthropic' for Claude Code, 'openai' for Codex) -> a deterministic plan built from the Task's own content, no model call (returns draftId + markdown with the exact prompt). execute: draftId + approved -> for mastra, runs AURA's own agent directly against the scaffolded directory (list_files/read_file/write_file only, no shell access); for anthropic/openai, runs that CLI inside the sandboxed container using the developer's own CLI login on this machine (claude login / codex login - not an API key). Either way it then comments the Task and moves it toward In Review. Never execute without an explicit human approval. Fails clearly if the Task has not been scaffolded yet (run delegate_to_dev first) or, for anthropic/openai, if that CLI has not been logged into on this machine.",
  inputSchema: codingInputSchema,
  outputSchema: codingOutputSchema,
  execute: async (input, { agent, writer }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        // Builds the plan deterministically from the Task itself - discipline routes to the
        // same directory the Dev agent scaffolded (delegate_to_dev must have run first).
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const taskKey = input.taskKey?.trim().toUpperCase();
          if (!epicKey || !taskKey) return codeFail('draft needs epicKey, taskKey, and provider');
          if (!input.provider) return codeFail('draft needs a provider - ask the human "Claude Code" (anthropic) or "Codex" (openai) before drafting');
          const task = await jira.getIssue(taskKey);
          if (task.issueType && task.issueType.toLowerCase() !== 'task') return codeFail(`${taskKey} is a ${task.issueType}, not a Task`);
          const discipline = disciplineFromTask(task.description || '');
          if (!discipline) return codeFail(`Could not read a discipline off ${taskKey} - it should carry "**Discipline:** <name>"`);

          const targetDir = await devWorkspaceDir(epicKey, discipline);
          let scaffolded = false;
          try {
            scaffolded = (await readdir(targetDir)).length > 0;
          } catch {
            scaffolded = false;
          }
          if (!scaffolded) return codeFail(`${taskKey} has not been scaffolded yet - run delegate_to_dev for it first (Gate 4), then come back here`);

          const prompt = [
            `Implement Jira Task ${taskKey}: ${task.summary}`,
            '',
            task.description || '(no description)',
            '',
            'Work only within this directory. Make the acceptance criteria above pass. Do not touch files outside it, and do not run destructive commands.',
          ].join('\n');

          const content: CodingTaskDraft = { epicKey, taskKey, discipline, targetDir, provider: input.provider, prompt };
          const record = await draftStore.create({ kind: 'coding-task', content, threadId, epicKey });
          return { ok: true, draftId: record.id, markdown: renderCodingPlan(content), epicKey, taskKey };
        }
        // Fetches the human's own connected key just-in-time (never persisted here), writes
        // the prompt to a file, and runs the fixed CLI invocation for the drafted provider.
        // Idempotent: a draft already executed just reports its prior result.
        case 'execute': {
          if (!input.draftId) return codeFail('execute needs draftId');
          if (input.approved !== true) return codeFail('execute requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<CodingTaskDraft>(input.draftId);
          if (!record || record.kind !== 'coding-task') return codeFail(`unknown coding draft ${input.draftId}`);

          if (record.filed.status === 'done') {
            return {
              ok: true,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              targetDir: record.content.targetDir,
              exitCode: Number(record.filed.exitCode ?? '0'),
              markdown: `Already ran (exit code ${record.filed.exitCode ?? '0'}). Nothing was run twice.`,
            };
          }

          try {
            await writeFile(path.join(record.content.targetDir, PROMPT_FILE), record.content.prompt, 'utf8');
          } catch (error) {
            return codeFail(error);
          }

          let result: { exitCode: number; output: string };
          if (record.content.provider === 'mastra') {
            // Built-in agent: no external credential, no Docker - runs in-process, contained
            // entirely by its own tool surface (list_files/read_file/write_file, path-checked
            // against record.content.targetDir - see tools/file-tools.ts).
            try {
              const codingAgent = createCodingAgent(record.content.targetDir);
              const response = await codingAgent.generate(record.content.prompt, { maxSteps: 20 });
              const summary = response.text?.trim() || '(the agent made changes but returned no summary text)';
              void writer?.custom({ type: 'data-code-output', data: { chunk: summary }, transient: true });
              result = { exitCode: 0, output: summary };
            } catch (error) {
              result = { exitCode: 1, output: error instanceof Error ? error.message : String(error) };
            }
          } else {
            const cli = CODING_COMMANDS[record.content.provider];

            try {
              await access(cli.hostCredential);
            } catch {
              return codeFail(`${codingProviderLabel[record.content.provider]} is not logged in on this machine. ${cli.loginHint}`);
            }

            if (!(await isDockerAvailable())) return codeFail('Docker is not available - install/start Docker to run the coding agent');

            try {
              result = await runInContainer({
                image: cli.image,
                hostDir: record.content.targetDir,
                command: cli.command,
                mounts: [{ hostPath: cli.hostCredential, containerPath: cli.containerCredential, readOnly: true }],
                timeoutMs: 20 * 60_000,
                name: `aura-code-${record.id}`,
                labels: { 'aura.epic': record.content.epicKey, 'aura.task': record.content.taskKey, 'aura.kind': 'code' },
                onOutput: (chunk) => {
                  void writer?.custom({ type: 'data-code-output', data: { chunk }, transient: true });
                },
              });
            } catch (error) {
              return codeFail(error);
            }
          }

          await draftStore.markFiled(record.id, { status: 'done', exitCode: String(result.exitCode) });
          const stamp = provenance('Coding Agent', codingProviderLabel[record.content.provider], record, `${record.content.taskKey} (Task)`);
          try {
            await jira.addComment(record.content.taskKey, codingFiledComment(record.content, result.exitCode, result.output, stamp));
          } catch {
            // The comment is informational; the code on disk is what matters.
          }
          if (result.exitCode === 0) {
            try {
              const transitions = await jira.getTransitions(record.content.taskKey);
              const inReview = transitions.find((t) => t.name.toLowerCase() === 'in review');
              if (inReview) await jira.transitionIssue(record.content.taskKey, inReview.id);
            } catch {
              // Best-effort; proceed regardless.
            }
          }

          if (result.exitCode !== 0) {
            return {
              ok: false,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              exitCode: result.exitCode,
              error: `Coding agent failed (exit code ${result.exitCode}). Last output:\n${result.output.slice(-2000)}`,
            };
          }
          return {
            ok: true,
            draftId: record.id,
            epicKey: record.content.epicKey,
            taskKey: record.content.taskKey,
            targetDir: record.content.targetDir,
            exitCode: result.exitCode,
            markdown: `Coding agent finished at ${record.content.targetDir}. Review the changes before merging.`,
          };
        }
      }
    } catch (error) {
      return codeFail(error);
    }
  },
});

// ==================== QA Agent (Gate 6) ====================

interface QaWorkflowStreamOutput {
  fullStream: AsyncIterable<{ type: string; id?: string; payload?: { status?: string; id?: string } }>;
  result: Promise<{ status: string; result?: unknown; error?: { message?: string } }>;
}
interface QaWorkflowRun {
  stream: (args: { inputData: { epicKey: string; epicSummary: string; storiesText: string } }) => QaWorkflowStreamOutput;
}
interface QaWorkflowLike {
  createRun: () => Promise<QaWorkflowRun>;
}
type QaMastra = (MastraLike & { getWorkflow?: (id: string) => QaWorkflowLike } & Partial<WorkspaceRegistry>) | undefined;

// Runs the QA Workflow, relaying each step's start/result into this tool's own stream, the same
// pattern as runArchitectWorkflow above.
async function runQaWorkflow(mastra: QaMastra, input: { epicKey: string; epicSummary: string; storiesText: string }, writer: ToolWriterLike | undefined): Promise<QaDraft> {
  const workflow = mastra?.getWorkflow?.('qa-workflow');
  if (!workflow) throw new Error('qa-workflow is not registered');
  const run = await workflow.createRun();
  const streamOutput = run.stream({ inputData: input });
  for await (const chunk of streamOutput.fullStream) {
    if (chunk.type === 'workflow-step-start' || chunk.type === 'workflow-step-result') {
      const stepId = chunk.id ?? chunk.payload?.id;
      await writer?.custom({ type: 'data-qa-step', data: { stepId, phase: chunk.type === 'workflow-step-start' ? 'start' : 'result', status: chunk.payload?.status }, transient: true });
    }
  }
  const result = await streamOutput.result;
  if (result.status !== 'success') throw new Error(`test plan generation failed (${result.status})${result.error?.message ? `: ${result.error.message}` : ''}`);
  return result.result as QaDraft;
}

const qaInputSchema = z
  .object({
    mode: z.enum(['draft', 'revise', 'file']),
    epicKey: z.string().optional().describe('draft: the Epic whose approved Stories to write a test plan for'),
    draftId: z.string().optional().describe('revise and file: the draftId returned earlier'),
    feedback: z.string().optional().describe('revise: the human feedback, verbatim'),
    approved: z.boolean().optional().describe('file: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const qaOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable draft. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  scenarioCount: z.number().optional(),
  error: z.string().optional(),
});

function qaFail(error: unknown): z.infer<typeof qaOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export const delegateToQaTool = createTool({
  id: 'delegate_to_qa',
  description:
    "QA Agent (Gate 6). draft: epicKey -> a test plan and real Playwright source generated from the Epic's approved Stories (returns draftId + markdown). revise: draftId + feedback -> new draftId + markdown. file: draftId + approved -> test-plan.md and one .spec.ts file per scenario written to the QA workspace, commented on the Epic (returns scenarioCount). Never file without an explicit human approval. Requires the Epic to already have approved Stories filed (run delegate_to_ba first).",
  inputSchema: qaInputSchema,
  outputSchema: qaOutputSchema,
  execute: async (input, { mastra, agent, writer }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          if (!epicKey) return qaFail('draft needs epicKey');
          const epic = await jira.getIssue(epicKey);
          if (epic.issueType && epic.issueType.toLowerCase() !== 'epic') return qaFail(`${epicKey} is a ${epic.issueType}, not an Epic`);
          const stories = await jira.getEpicStories(epicKey);
          const storyIssues = stories.filter((s) => s.issueType.toLowerCase() === 'story');
          if (!storyIssues.length) return qaFail(`${epicKey} has no Stories yet - run delegate_to_ba and file Stories before drafting a test plan`);
          const storiesText = storyIssues.map((s) => `- ${s.key}: ${s.summary}\n${s.description || '(no description)'}`).join('\n\n');
          const content = await runQaWorkflow(mastra as QaMastra, { epicKey, epicSummary: epic.summary, storiesText }, writer);
          const record = await draftStore.create({ kind: 'qa-plan', content, threadId, epicKey });
          return { ok: true, draftId: record.id, markdown: renderTestPlan(content), epicKey, scenarioCount: content.scenarios.length };
        }
        case 'revise': {
          if (!input.draftId || !input.feedback?.trim()) return qaFail('revise needs draftId and feedback');
          const previous = await draftStore.get<QaDraft>(input.draftId);
          if (!previous || previous.kind !== 'qa-plan') return qaFail(`unknown QA draft ${input.draftId}`);
          const prompt = `Revise this test plan according to the feedback. Return the complete updated plan, including full playwrightSource for every scenario (even unchanged ones). Keep epicKey "${previous.content.epicKey}".\n\nCurrent draft (JSON):\n${JSON.stringify(previous.content)}\n\nFeedback:\n${input.feedback.trim()}`;
          const content = await generateObject<QaDraft>(mastra as MastraLike, 'qa', prompt, qaDraftSchema);
          content.epicKey = previous.content.epicKey;
          const record = await draftStore.create({ kind: 'qa-plan', content, threadId, epicKey: previous.epicKey, parentId: previous.id });
          return { ok: true, draftId: record.id, markdown: renderTestPlan(content), epicKey: previous.content.epicKey, scenarioCount: content.scenarios.length };
        }
        case 'file': {
          if (!input.draftId) return qaFail('file needs draftId');
          if (input.approved !== true) return qaFail('file requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<QaDraft>(input.draftId);
          if (!record || record.kind !== 'qa-plan') return qaFail(`unknown QA draft ${input.draftId}`);
          const epicKey = record.content.epicKey;
          const filed = { ...record.filed };

          if (!filed.workspaceWritten) {
            const workspaceRegistry = mastra as QaMastra;
            if (!workspaceRegistry?.listWorkspaces || !workspaceRegistry.addWorkspace) throw new Error('Mastra workspace registry is not available');
            const fs = qaWorkspace(workspaceRegistry as WorkspaceRegistry, epicKey).filesystem;
            if (!fs) throw new Error('QA workspace filesystem is not available');
            await fs.writeFile('test-plan.md', renderTestPlan(record.content), { recursive: true, overwrite: true });
            for (const scenario of record.content.scenarios) {
              await fs.writeFile(`tests/${scenario.fileName}.spec.ts`, scenario.playwrightSource, { recursive: true, overwrite: true });
            }
            filed.workspaceWritten = 'done';
            await draftStore.markFiled(record.id, filed);
          }

          if (!filed.comment) {
            try {
              const stamp = provenance('QA Agent', QA_MODEL_ID, record, `${epicKey} (Epic)`);
              const scenarioPaths = record.content.scenarios.map((s) => `tests/${s.fileName}.spec.ts`);
              await jira.addComment(epicKey, qaFiledComment(record.content, 'test-plan.md', scenarioPaths, stamp));
              filed.comment = 'done';
              await draftStore.markFiled(record.id, filed);
            } catch {
              // The comment is informational; the workspace files are what matters.
            }
          }
          return { ok: true, draftId: record.id, epicKey, scenarioCount: record.content.scenarios.length };
        }
      }
    } catch (error) {
      return qaFail(error);
    }
  },
});

// ==================== Tester Agent (Gate 7) ====================

interface TestRunEntry {
  image: string;
  port: number;
  startCommand: string;
  description: string;
}

// Fixed per discipline, like SCAFFOLD_COMMANDS - never chosen by a model. Only the two
// disciplines Gate 4 actually scaffolds reliably (docs/adr/0001-dev-agent-scaffold-and-template-
// strategy.md) are supported; anything else fails clearly rather than guessing how to start an
// app it was never taught to run.
const TEST_COMMANDS: Partial<Record<'Frontend' | 'Backend', TestRunEntry>> = {
  Frontend: {
    image: 'mcr.microsoft.com/playwright:v1.48.0-jammy',
    port: 4173,
    startCommand: 'npm run dev -- --port 4173 --strictPort',
    description: 'npm install, start the Vite dev server on port 4173, wait for it to respond, then run the QA-filed Playwright suite against it.',
  },
  Backend: {
    image: 'mcr.microsoft.com/playwright:v1.48.0-jammy',
    port: 4000,
    startCommand: 'PORT=4000 npm run start',
    description: 'npm install, start the NestJS app on port 4000, wait for it to respond, then run the QA-filed Playwright suite against it.',
  },
};

const TEST_RESULTS_FILE = 'test-results.json';
const TEST_SETUP_FAILED_FILE = 'test-setup-failed.txt';

interface PlaywrightJsonResultRoot {
  stats?: { expected?: number; unexpected?: number; skipped?: number; duration?: number };
  suites?: unknown[];
}

// Builds the fixed shell script run inside the container. Setup (install + start + wait for the
// port) is separated from the test run itself with its own `|| { ...; exit 0 }` branch, so a
// real test failure (Playwright's own non-zero exit) is never confused with the app failing to
// start - only the latter writes TEST_SETUP_FAILED_FILE. The whole script always exits 0; the
// real result lives in TEST_RESULTS_FILE, read back by delegate-tools.ts after the container
// exits, never in this exit code (principle 5 - a red suite must never look like an infra crash).
function buildTestCommand(entry: TestRunEntry): string {
  return [
    'npm install --silent',
    `(${entry.startCommand} > /tmp/app.log 2>&1 &)`,
    `npx --yes wait-on@7 http://localhost:${entry.port} --timeout 30000 || { echo SETUP_FAILED > /workspace/${TEST_SETUP_FAILED_FILE}; cp /tmp/app.log /workspace/app.log 2>/dev/null; exit 0; }`,
    `APP_BASE_URL=http://localhost:${entry.port} npx --yes playwright test /qa-tests --reporter=json > /workspace/${TEST_RESULTS_FILE} 2>/workspace/test-stderr.log`,
    'true',
  ].join('\n');
}

// Walks Playwright's JSON reporter shape (suites -> specs -> tests -> results) to pull out each
// failing test's title path and error message. Best-effort: an unrecognized future shape
// degrades to an empty list, never a crash - the raw file is still attached to the Jira comment.
function extractFailures(raw: unknown): { name: string; error: string }[] {
  const failures: { name: string; error: string }[] = [];
  function walk(node: unknown, titlePath: string[]): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    const nextPath = typeof n.title === 'string' ? [...titlePath, n.title] : titlePath;
    if (Array.isArray(n.suites)) for (const s of n.suites) walk(s, nextPath);
    if (Array.isArray(n.specs)) for (const s of n.specs) walk(s, nextPath);
    if (Array.isArray(n.tests)) {
      for (const t of n.tests as Record<string, unknown>[]) {
        const results = Array.isArray(t.results) ? (t.results as Record<string, unknown>[]) : [];
        const failedResult = results.find((r) => r.status === 'failed' || r.status === 'timedOut');
        if (failedResult) {
          const error = (failedResult.error as Record<string, unknown> | undefined)?.message;
          failures.push({ name: nextPath.join(' > '), error: typeof error === 'string' ? error : 'no error message captured' });
        }
      }
    }
  }
  walk(raw, []);
  return failures;
}

interface TestRunDraft {
  epicKey: string;
  taskKey: string;
  targetDir: string;
  discipline: 'Frontend' | 'Backend';
}

const testInputSchema = z
  .object({
    mode: z.enum(['draft', 'execute']),
    epicKey: z.string().optional().describe('draft: the Epic this Task belongs to (must have a filed QA plan)'),
    taskKey: z.string().optional().describe('draft: the Jira Task key to test (must already be scaffolded via delegate_to_dev)'),
    draftId: z.string().optional().describe('execute: the draftId returned by draft'),
    approved: z.boolean().optional().describe('execute: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const testOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable plan, or the interpreted real result after execute. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  taskKey: z.string().optional(),
  passed: z.number().optional(),
  failed: z.number().optional(),
  error: z.string().optional(),
});

function testFail(error: unknown): z.infer<typeof testOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

const testerInterpretationSchema = z.object({
  summary: z.string().min(10),
  failureNotes: z.array(z.object({ name: z.string(), verdict: z.enum(['likely-real', 'likely-flaky', 'unsure']), note: z.string() })),
});

export const delegateToTestTool = createTool({
  id: 'delegate_to_test',
  description:
    "Tester Agent (Gate 7). draft: epicKey + taskKey -> confirms the Task is scaffolded and its Epic has a filed QA plan, returns the fixed test-run plan (returns draftId + markdown). execute: draftId + approved -> actually starts the scaffolded app and runs the QA Agent's real Playwright suite against it inside a sandboxed Docker container, reads back the real JSON result, and has the Tester Agent interpret it - never fakes, assumes, or rounds a result. Comments the Task with the real pass/fail numbers plus the interpretation, kept visibly separate. Only Frontend and Backend/NestJS are supported (the disciplines Gate 4 actually scaffolds reliably) - fails clearly for anything else. Never execute without an explicit human approval.",
  inputSchema: testInputSchema,
  outputSchema: testOutputSchema,
  execute: async (input, { mastra, agent, writer }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const taskKey = input.taskKey?.trim().toUpperCase();
          if (!epicKey || !taskKey) return testFail('draft needs epicKey and taskKey');
          const task = await jira.getIssue(taskKey);
          if (task.issueType && task.issueType.toLowerCase() !== 'task') return testFail(`${taskKey} is a ${task.issueType}, not a Task`);
          const discipline = disciplineFromTask(task.description || '');
          if (!discipline) return testFail(`Could not read a discipline off ${taskKey} - it should carry "**Discipline:** <name>"`);
          if (discipline !== 'Frontend' && discipline !== 'Backend') return testFail(`Gate 7 only supports Frontend and Backend Tasks (Gate 4's only reliable scaffolds) - ${taskKey} is ${discipline}`);
          const entry = TEST_COMMANDS[discipline];
          if (!entry) return testFail(`No test runner is configured for ${discipline} yet`);

          const targetDir = await devWorkspaceDir(epicKey, discipline);
          let scaffolded = false;
          try {
            scaffolded = (await readdir(targetDir)).length > 0;
          } catch {
            scaffolded = false;
          }
          if (!scaffolded) return testFail(`${taskKey} has not been scaffolded yet - run delegate_to_dev for it first (Gate 4)`);

          const qaRecord = await draftStore.latestByEpic<QaDraft>('qa-plan', epicKey);
          if (!qaRecord || !qaRecord.filed.workspaceWritten) return testFail(`${epicKey} has no filed QA plan yet - run delegate_to_qa (Gate 6) and file it before testing`);

          const content: TestRunDraft = { epicKey, taskKey, targetDir, discipline };
          const record = await draftStore.create({ kind: 'test-run', content, threadId, epicKey });
          const markdown = [
            `# Test run plan for ${taskKey} (${epicKey})`,
            '',
            '*Deterministic - the run command is fixed by AURA, not chosen by a model. Pass/fail comes from the real Playwright result, read back after the container exits.*',
            '',
            `**Discipline:** ${discipline}`,
            `**Target directory:** ${targetDir}`,
            '',
            '## What will run',
            entry.description,
          ].join('\n');
          return { ok: true, draftId: record.id, epicKey, taskKey, markdown };
        }
        case 'execute': {
          if (!input.draftId) return testFail('execute needs draftId');
          if (input.approved !== true) return testFail('execute requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<TestRunDraft>(input.draftId);
          if (!record || record.kind !== 'test-run') return testFail(`unknown test draft ${input.draftId}`);

          if (record.filed.status === 'done') {
            return {
              ok: true,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              passed: Number(record.filed.passed ?? '0'),
              failed: Number(record.filed.failed ?? '0'),
              markdown: 'Already ran. Nothing was run twice.',
            };
          }

          const entry = TEST_COMMANDS[record.content.discipline];
          if (!entry) return testFail(`No test runner is configured for ${record.content.discipline}`);
          if (!(await isDockerAvailable())) return testFail('Docker is not available - install/start Docker to run tests');

          const qaTestsDir = path.resolve(qaWorkspaceRoot, record.content.epicKey, 'tests');
          try {
            await access(qaTestsDir);
          } catch {
            return testFail(`No Playwright test files found at ${qaTestsDir} - re-run delegate_to_qa's file step for ${record.content.epicKey}`);
          }

          try {
            await runInContainer({
              image: entry.image,
              hostDir: record.content.targetDir,
              command: buildTestCommand(entry),
              mounts: [{ hostPath: qaTestsDir, containerPath: '/qa-tests', readOnly: true }],
              timeoutMs: 15 * 60_000,
              name: `aura-test-${record.id}`,
              labels: { 'aura.epic': record.content.epicKey, 'aura.task': record.content.taskKey, 'aura.kind': 'test' },
              onOutput: (chunk) => {
                void writer?.custom({ type: 'data-test-output', data: { chunk }, transient: true });
              },
            });
          } catch (error) {
            return testFail(error);
          }

          const setupFailedPath = path.join(record.content.targetDir, TEST_SETUP_FAILED_FILE);
          const resultsPath = path.join(record.content.targetDir, TEST_RESULTS_FILE);
          try {
            await access(setupFailedPath);
            const appLog = await readFile(path.join(record.content.targetDir, 'app.log'), 'utf-8').catch(() => '(no app log captured)');
            return testFail(`The app never started listening on its port within 30s, so no tests ran. Last app output:\n${appLog.slice(-2000)}`);
          } catch {
            // No setup-failed marker - proceed to read the real result.
          }

          let raw: PlaywrightJsonResultRoot;
          try {
            raw = JSON.parse(await readFile(resultsPath, 'utf-8')) as PlaywrightJsonResultRoot;
          } catch (error) {
            return testFail(`Neither a result nor a setup-failure marker was found after the run - something unexpected happened. ${error instanceof Error ? error.message : String(error)}`);
          }

          const passed = raw.stats?.expected ?? 0;
          const failed = raw.stats?.unexpected ?? 0;
          const skipped = raw.stats?.skipped ?? 0;
          const failures = extractFailures(raw);

          let interpretation = { summary: `${passed} passed, ${failed} failed, ${skipped} skipped. No failures to interpret.`, failureNotes: [] as z.infer<typeof testerInterpretationSchema>['failureNotes'] };
          if (failures.length) {
            const prompt = `Interpret this real Playwright result for Task ${record.content.taskKey} - ${passed} passed, ${failed} failed, ${skipped} skipped.\n\nFailures:\n${failures.map((f) => `- ${f.name}: ${f.error}`).join('\n')}\n\nReturn only the JSON the schema describes.`;
            interpretation = await generateObject(mastra as MastraLike, 'tester', prompt, testerInterpretationSchema);
          }

          const markdown = [
            `# Test result for ${record.content.taskKey} (${record.content.epicKey})`,
            '',
            `**Real result:** ${passed} passed, ${failed} failed, ${skipped} skipped.`,
            '',
            '## AI interpretation',
            interpretation.summary,
            ...(interpretation.failureNotes.length ? ['', ...interpretation.failureNotes.map((f) => `- **${f.name}** (${f.verdict}): ${f.note}`)] : []),
          ].join('\n');

          await draftStore.markFiled(record.id, { status: 'done', passed: String(passed), failed: String(failed) });
          const stamp = provenance('Tester Agent', TESTER_MODEL_ID, record, `${record.content.taskKey} (Task)`);
          try {
            await jira.addComment(
              record.content.taskKey,
              [
                `AURA Tester Agent ran the Gate 6 Playwright suite: ${passed} passed, ${failed} failed, ${skipped} skipped (machine result).`,
                '',
                '**AI interpretation:**',
                interpretation.summary,
                ...(interpretation.failureNotes.length ? ['', ...interpretation.failureNotes.map((f) => `- **${f.name}** (${f.verdict}): ${f.note}`)] : []),
                '',
                '----',
                stamp,
              ].join('\n'),
            );
            if (failed === 0) {
              const transitions = await jira.getTransitions(record.content.taskKey);
              const ready = transitions.find((t) => t.name.toLowerCase() === 'ready for release');
              if (ready) await jira.transitionIssue(record.content.taskKey, ready.id);
            }
          } catch {
            // Best-effort; the real result and interpretation are already returned to the human.
          }

          return { ok: true, draftId: record.id, epicKey: record.content.epicKey, taskKey: record.content.taskKey, passed, failed, markdown };
        }
      }
    } catch (error) {
      return testFail(error);
    }
  },
});

// ==================== Deployer Agent (Gate 8, plan-only) ====================

const deployInputSchema = z
  .object({
    mode: z.enum(['draft', 'revise', 'file']),
    epicKey: z.string().optional().describe('draft: the Epic whose filed Tasks to release'),
    draftId: z.string().optional().describe('revise and file: the draftId returned earlier'),
    feedback: z.string().optional().describe('revise: the human feedback, verbatim'),
    approved: z.boolean().optional().describe('file: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const deployOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable draft. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  error: z.string().optional(),
});

function deployFail(error: unknown): z.infer<typeof deployOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export const delegateToDeployTool = createTool({
  id: 'delegate_to_deploy',
  description:
    "Deployer Agent (Gate 8, plan-only). draft: epicKey -> release notes, a change plan, and a rollback plan drafted from the Epic's filed Tasks (returns draftId + markdown). revise: draftId + feedback -> new draftId + markdown. file: draftId + approved -> posted as a Jira comment on the Epic (returns epicKey). There is no execute mode - AURA has no real deployment pipeline, so this agent only prepares a plan for a human to carry out; it never claims a release happened. Never file without an explicit human approval.",
  inputSchema: deployInputSchema,
  outputSchema: deployOutputSchema,
  execute: async (input, { mastra, agent }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          if (!epicKey) return deployFail('draft needs epicKey');
          const epic = await jira.getIssue(epicKey);
          if (epic.issueType && epic.issueType.toLowerCase() !== 'epic') return deployFail(`${epicKey} is a ${epic.issueType}, not an Epic`);
          const items = await jira.getEpicStories(epicKey);
          const tasks = items.filter((i) => i.issueType.toLowerCase() === 'task');
          if (!tasks.length) return deployFail(`${epicKey} has no filed Tasks yet - nothing to release`);
          const tasksText = tasks.map((t) => `- ${t.key}: ${t.summary}\n${t.description || '(no description)'}`).join('\n\n');
          const prompt = `Draft a release plan for Epic ${epicKey}: ${epic.summary}.\n\nFiled Tasks:\n${tasksText}\n\nReturn only the JSON the schema describes.`;
          const content = await generateObject<DeployDraft>(mastra as MastraLike, 'deployer', prompt, deployDraftSchema);
          content.epicKey = epicKey;
          const record = await draftStore.create({ kind: 'deploy-plan', content, threadId, epicKey });
          return { ok: true, draftId: record.id, markdown: renderDeployPlan(content), epicKey };
        }
        case 'revise': {
          if (!input.draftId || !input.feedback?.trim()) return deployFail('revise needs draftId and feedback');
          const previous = await draftStore.get<DeployDraft>(input.draftId);
          if (!previous || previous.kind !== 'deploy-plan') return deployFail(`unknown deploy draft ${input.draftId}`);
          const prompt = `Revise this release plan according to the feedback. Return the complete updated plan. Keep epicKey "${previous.content.epicKey}".\n\nCurrent draft (JSON):\n${JSON.stringify(previous.content)}\n\nFeedback:\n${input.feedback.trim()}`;
          const content = await generateObject<DeployDraft>(mastra as MastraLike, 'deployer', prompt, deployDraftSchema);
          content.epicKey = previous.content.epicKey;
          const record = await draftStore.create({ kind: 'deploy-plan', content, threadId, epicKey: previous.epicKey, parentId: previous.id });
          return { ok: true, draftId: record.id, markdown: renderDeployPlan(content), epicKey: previous.content.epicKey };
        }
        case 'file': {
          if (!input.draftId) return deployFail('file needs draftId');
          if (input.approved !== true) return deployFail('file requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<DeployDraft>(input.draftId);
          if (!record || record.kind !== 'deploy-plan') return deployFail(`unknown deploy draft ${input.draftId}`);
          if (record.filed.comment) return { ok: true, draftId: record.id, epicKey: record.content.epicKey };
          const stamp = provenance('Deployer Agent', DEPLOYER_MODEL_ID, record, `${record.content.epicKey} (Epic)`);
          await jira.addComment(record.content.epicKey, deployFiledComment(record.content, stamp));
          try {
            const transitions = await jira.getTransitions(record.content.epicKey);
            const ready = transitions.find((t) => t.name.toLowerCase() === 'ready for release');
            if (ready) await jira.transitionIssue(record.content.epicKey, ready.id);
          } catch {
            // Best-effort; the plan itself is what matters.
          }
          await draftStore.markFiled(record.id, { ...record.filed, comment: 'done' });
          return { ok: true, draftId: record.id, epicKey: record.content.epicKey };
        }
      }
    } catch (error) {
      return deployFail(error);
    }
  },
});

// ==================== Git workspace tool ====================

const gitInputSchema = z
  .object({
    mode: z.enum(['draft', 'execute', 'read']),
    epicKey: z.string().optional().describe('draft and read: the Epic this Task belongs to'),
    taskKey: z.string().optional().describe('draft and read: the Jira Task key whose scaffolded directory to operate on'),
    op: z.enum(['init', 'branch', 'commit', 'status', 'diff']).optional().describe('draft: one of init, branch, commit. read: one of status, diff.'),
    branchName: z.string().optional().describe('draft with op=branch only: the branch name to create; defaults to task/<taskKey>'),
    draftId: z.string().optional().describe('execute: the draftId returned by draft'),
    approved: z.boolean().optional().describe('execute: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const gitOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable plan or output. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  taskKey: z.string().optional(),
  error: z.string().optional(),
});

function gitFail(error: unknown): z.infer<typeof gitOutputSchema> {
  const withStderr = error as { stderr?: unknown; message?: unknown } | null;
  const message = withStderr && typeof withStderr === 'object' && withStderr.stderr ? String(withStderr.stderr) : error instanceof Error ? error.message : String(error);
  return { ok: false, error: message };
}

// Resolves a Task's scaffolded directory (same lookup delegate_to_code uses), for git commands
// to run directly against - no Docker, git runs on the host as the same user that owns the
// scaffolded files (node:22-slim has no git installed anyway, and this directory is already
// host-trusted - docs/ARCHITECTURE.md section 6.4).
async function taskTargetDir(taskKey: string, epicKey: string): Promise<{ targetDir: string; discipline: string } | { error: string }> {
  const task = await jira.getIssue(taskKey);
  if (task.issueType && task.issueType.toLowerCase() !== 'task') return { error: `${taskKey} is a ${task.issueType}, not a Task` };
  const discipline = disciplineFromTask(task.description || '');
  if (!discipline) return { error: `Could not read a discipline off ${taskKey} - it should carry "**Discipline:** <name>"` };
  return { targetDir: await devWorkspaceDir(epicKey, discipline), discipline };
}

export const delegateToGitTool = createTool({
  id: 'delegate_to_git',
  description:
    'Git workspace tool for a scaffolded Task\'s directory. read: epicKey + taskKey + op ("status" or "diff") -> runs immediately, no approval needed (non-mutating). draft: epicKey + taskKey + op ("init", "branch", or "commit") -> a fixed git command (returns draftId + markdown) - the command and, for commit, its message are built deterministically, never chosen by a model. execute: draftId + approved -> runs it directly on the host (no Docker - git runs against the same host-owned directory Gate 4/5 already write to) and comments the Task. Never execute without an explicit human approval.',
  inputSchema: gitInputSchema,
  outputSchema: gitOutputSchema,
  execute: async (input, { agent }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        case 'read': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const taskKey = input.taskKey?.trim().toUpperCase();
          if (!epicKey || !taskKey) return gitFail('read needs epicKey and taskKey');
          if (input.op !== 'status' && input.op !== 'diff') return gitFail('read needs op "status" or "diff"');
          const resolved = await taskTargetDir(taskKey, epicKey);
          if ('error' in resolved) return gitFail(resolved.error);
          const args = input.op === 'status' ? ['status', '--short'] : ['diff'];
          try {
            const r = await execFileAsync('git', args, { cwd: resolved.targetDir });
            return { ok: true, epicKey, taskKey, markdown: '```\n' + (r.stdout.trim() || '(clean - nothing to show)') + '\n```' };
          } catch (error) {
            return gitFail(error);
          }
        }
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const taskKey = input.taskKey?.trim().toUpperCase();
          if (!epicKey || !taskKey) return gitFail('draft needs epicKey and taskKey');
          const op = input.op;
          if (op !== 'init' && op !== 'branch' && op !== 'commit') return gitFail(`draft needs op: one of ${gitOps.join(', ')}`);
          const resolved = await taskTargetDir(taskKey, epicKey);
          if ('error' in resolved) return gitFail(resolved.error);
          const task = await jira.getIssue(taskKey);

          let args: string[] = [];
          let description = '';
          if (op === 'init') {
            description = 'git init (safe even if this directory is already a repo - git no-ops in that case).';
          } else if (op === 'branch') {
            const branchName = input.branchName?.trim() || `task/${taskKey}`;
            args = [branchName];
            description = `git checkout -b ${branchName}`;
          } else {
            const message = `${taskKey}: ${task.summary} (AURA)`;
            args = [message];
            description = `git add -A && git commit -m "${message}"`;
          }

          const content: GitOpDraft = { epicKey, taskKey, targetDir: resolved.targetDir, op, args, description };
          const record = await draftStore.create({ kind: 'git-op', content, threadId, epicKey });
          return { ok: true, draftId: record.id, epicKey, taskKey, markdown: renderGitOpPlan(content) };
        }
        case 'execute': {
          if (!input.draftId) return gitFail('execute needs draftId');
          if (input.approved !== true) return gitFail('execute requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<GitOpDraft>(input.draftId);
          if (!record || record.kind !== 'git-op') return gitFail(`unknown git draft ${input.draftId}`);
          if (record.filed.status === 'done') {
            return { ok: true, draftId: record.id, epicKey: record.content.epicKey, taskKey: record.content.taskKey, markdown: 'Already ran. Nothing was run twice.' };
          }

          const { targetDir, op, args } = record.content;
          let output = '';
          let exitCode = 0;
          try {
            if (op === 'init') {
              const r = await execFileAsync('git', ['init'], { cwd: targetDir });
              output = r.stdout + r.stderr;
            } else if (op === 'branch') {
              const r = await execFileAsync('git', ['checkout', '-b', ...args], { cwd: targetDir });
              output = r.stdout + r.stderr;
            } else {
              const add = await execFileAsync('git', ['add', '-A'], { cwd: targetDir });
              const commit = await execFileAsync('git', ['commit', '-m', args[0] ?? 'AURA commit'], { cwd: targetDir });
              output = add.stdout + add.stderr + commit.stdout + commit.stderr;
            }
          } catch (error) {
            const execError = error as { stdout?: string; stderr?: string; code?: number | null; message: string };
            exitCode = execError.code ?? 1;
            output = (execError.stdout ?? '') + (execError.stderr ?? '') || execError.message;
          }

          await draftStore.markFiled(record.id, { status: 'done', exitCode: String(exitCode) });
          const stamp = provenance('Git workspace tool', 'deterministic (no model)', record, `${record.content.taskKey} (Task)`);
          try {
            await jira.addComment(record.content.taskKey, gitOpFiledComment(record.content, exitCode, output, stamp));
          } catch {
            // Informational only; the git operation itself already ran.
          }

          if (exitCode !== 0) {
            return { ok: false, draftId: record.id, epicKey: record.content.epicKey, taskKey: record.content.taskKey, error: `git ${op} failed (exit ${exitCode}). Output:\n${output.slice(-2000)}` };
          }
          return { ok: true, draftId: record.id, epicKey: record.content.epicKey, taskKey: record.content.taskKey, markdown: `git ${op} finished.\n\n\`\`\`\n${output.trim().slice(-1500) || '(no output)'}\n\`\`\`` };
        }
      }
    } catch (error) {
      return gitFail(error);
    }
  },
});
