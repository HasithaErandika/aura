import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { deployDraftSchema, deployFiledComment, renderDeployPlan, type DeployDraft } from '../../contracts/deploy-drafts';
import { draftStore } from '../../store/draft-store';
import { jira } from '../../mcp/jira-client';
import { DEPLOYER_MODEL_ID } from '../../agents/registry';
import { generateObject, type MastraLike } from '../../lib/generate-object';
import { provenance } from './shared';

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
