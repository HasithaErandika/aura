import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { deployDraftSchema, deployFiledComment, renderDeployPlan, type DeployDraft } from '../../contracts/deploy-drafts';
import { draftStore } from '../../store/draft-store';
import { jira } from '../../mcp/jira-client';
import { DEPLOYER_MODEL_ID } from '../../agents/registry';
import { generateObject, type MastraLike } from '../../lib/generate-object';
import { provenance, buildProvenance, type ProvenanceStamp } from './shared';
import { deployDraftPrompt } from '../../contracts/prompts';

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
  provenance: z.custom<ProvenanceStamp>().optional(),
});

function deployFail(error: unknown): z.infer<typeof deployOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export const delegateToDeployTool = createTool({
  id: 'delegate_to_deploy',
  description:
    "Deployer Agent (Gate 8, plan-only). draft: epicKey -> release notes, change plan and rollback plan from the Epic's filed Tasks. revise: draftId + feedback. file: draftId + approved -> Jira comment on the Epic. No execute mode: AURA never deploys.",
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
          const prompt = deployDraftPrompt({ ...epic, key: epicKey }, tasks);
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
          const stamp = provenance('deployer-agent', DEPLOYER_MODEL_ID, record, `${record.content.epicKey} (Epic)`);
          await jira.addComment(record.content.epicKey, deployFiledComment(record.content, stamp));
          try {
            const transitions = await jira.getTransitions(record.content.epicKey);
            const ready = transitions.find((t) => t.name.toLowerCase() === 'ready for release');
            if (ready) await jira.transitionIssue(record.content.epicKey, ready.id);
          } catch {
            // Best-effort; the plan itself is what matters.
          }
          await draftStore.markFiled(record.id, { ...record.filed, comment: 'done' });
          return { ok: true, draftId: record.id, epicKey: record.content.epicKey, provenance: buildProvenance('deployer-agent', DEPLOYER_MODEL_ID, record, `${record.content.epicKey} (Epic)`) };
        }
      }
    } catch (error) {
      return deployFail(error);
    }
  },
});
