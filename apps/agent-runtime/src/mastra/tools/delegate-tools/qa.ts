import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { qaDocuments, qaDraftSchema, qaFiledComment, renderTestPlan, type QaDraft } from '../../contracts/qa-drafts';
import type { DesignDocLink } from '../../contracts/drafts';
import { designDocs } from '../../lib/design-docs-client';
import { draftStore } from '../../store/draft-store';
import { jira } from '../../mcp/jira-client';
import { QA_MODEL_ID } from '../../agents/registry';
import { generateObject, type MastraLike } from '../../lib/generate-object';
import { provenance, buildProvenance, type ProvenanceStamp, type ToolWriterLike } from './shared';
import { untrusted, untrustedInline } from '../../gateway/untrusted';

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
type QaMastra = (MastraLike & { getWorkflow?: (id: string) => QaWorkflowLike }) | undefined;

// Runs the QA workflow, relaying each step into this tool's stream.
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
    feedback: z.string().optional().describe('revise: the human\'s feedback, verbatim'),
    approved: z.boolean().optional().describe('file: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const qaOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('draft/revise: the human-readable draft, show it verbatim. file: where the test plan was saved - show it.'),
  epicKey: z.string().optional(),
  scenarioCount: z.number().optional(),
  error: z.string().optional(),
  provenance: z.custom<ProvenanceStamp>().optional(),
});

function qaFail(error: unknown): z.infer<typeof qaOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export const delegateToQaTool = createTool({
  id: 'delegate_to_qa',
  description:
    "QA Agent (test plan). draft: epicKey -> test plan and scenarios from the approved Stories. revise: draftId + feedback -> regenerates the plan. file: draftId + approved -> saves the plan and scenarios as QA documents and comments the Epic (returns scenarioCount). Needs filed Stories.",
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
          const storiesText = untrusted(`jira:${epicKey} stories`, storyIssues.map((s) => `- ${s.key}: ${s.summary}\n${s.description || '(no description)'}`).join('\n\n'));
          const content = await runQaWorkflow(mastra as QaMastra, { epicKey, epicSummary: untrustedInline(`jira:${epicKey} summary`, epic.summary), storiesText }, writer);
          const record = await draftStore.create({ kind: 'qa-plan', content, threadId, epicKey });
          return { ok: true, draftId: record.id, markdown: renderTestPlan(content), epicKey, scenarioCount: content.scenarios.length };
        }
        case 'revise': {
          if (!input.draftId || !input.feedback?.trim()) return qaFail('revise needs draftId and feedback');
          const previous = await draftStore.get<QaDraft>(input.draftId);
          if (!previous || previous.kind !== 'qa-plan') return qaFail(`unknown QA draft ${input.draftId}`);
          const prompt = `Revise this test plan according to the feedback. Return the complete updated plan with every scenario, changed or not. Keep epicKey "${previous.content.epicKey}".\n\nCurrent draft (JSON):\n${JSON.stringify(previous.content)}\n\nFeedback:\n${input.feedback.trim()}`;
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

          const docLinks: DesignDocLink[] = [];
          if (!filed.workspaceWritten) {
            for (const doc of qaDocuments(record.content)) {
              docLinks.push(await designDocs.save(epicKey, doc, { agent: 'qa-agent', draftId: record.id }));
            }
            filed.workspaceWritten = 'done';
            await draftStore.markFiled(record.id, filed);
          }

          if (!filed.comment) {
            try {
              const stamp = provenance('qa-agent', QA_MODEL_ID, record, `${epicKey} (Epic)`);
              await jira.addComment(epicKey, qaFiledComment(record.content, docLinks, stamp));
              filed.comment = 'done';
              await draftStore.markFiled(record.id, filed);
            } catch {
              // Informational only; the saved documents are what matters.
            }
          }
          return {
            ok: true,
            draftId: record.id,
            epicKey,
            scenarioCount: record.content.scenarios.length,
            markdown: `Test plan and ${record.content.scenarios.length} scenario(s) saved to the QA page. Developers turn them into tests on each Task branch; CI runs them on the PR.`,
            provenance: buildProvenance('qa-agent', QA_MODEL_ID, record, `${epicKey} (Epic)`),
          };
        }
      }
    } catch (error) {
      return qaFail(error);
    }
  },
});
