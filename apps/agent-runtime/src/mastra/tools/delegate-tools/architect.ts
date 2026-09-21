import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  architectureDraftSchema,
  architectureFiledComment,
  architectureTaskJiraDescription,
  backendFrameworks,
  renderAdr,
  renderArchitecture,
  renderPlan,
  renderRequirementsDoc,
  type ArchitectureDocPaths,
  type ArchitectureDraft,
} from '../../contracts/drafts';
import { draftStore } from '../../store/draft-store';
import { jira, jiraIssueUrl, type JiraIssueSummary } from '../../mcp/jira-client';
import { ARCHITECT_MODEL_ID } from '../../agents/registry';
import { generateObject, type MastraLike } from '../../lib/generate-object';
import { architectWorkspace, type WorkspaceRegistry } from '../../workspace/architect-workspace';
import { outputSchema, fail, provenance, slugify, type ToolWriterLike } from './shared';

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
