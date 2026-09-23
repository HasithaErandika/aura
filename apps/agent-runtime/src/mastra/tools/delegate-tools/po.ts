import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { epicDraftSchema, epicJiraDescription, renderEpic, type EpicDraft } from '../../contracts/drafts';
import { draftStore } from '../../store/draft-store';
import { jira, jiraIssueUrl } from '../../mcp/jira-client';
import { PO_MODEL_ID } from '../../agents/registry';
import { generateObject, type MastraLike } from '../../lib/generate-object';
import { outputSchema, fail, provenance, buildProvenance } from './shared';

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
              const source = '(free-text business requirement, no upstream Jira issue)';
              await jira.updateIssue(epicKey, {
                summary: content.title,
                description: epicJiraDescription(content, provenance('po-agent', PO_MODEL_ID, record, source)),
                priority: content.priority,
              });
              await jira.addComment(epicKey, `AURA PO Agent revised this Epic after human feedback:\n\n${input.feedback.trim()}`);
              await draftStore.markFiled(record.id, { epic: epicKey }, epicKey);
              return {
                ok: true,
                draftId: record.id,
                markdown: renderEpic(content),
                epicKey,
                epicUrl: jiraIssueUrl(epicKey),
                provenance: buildProvenance('po-agent', PO_MODEL_ID, record, source),
              };
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
          const source = '(free-text business requirement, no upstream Jira issue)';
          const created = await jira.createIssue({
            summary: record.content.title,
            issueType: 'Epic',
            description: epicJiraDescription(record.content, provenance('po-agent', PO_MODEL_ID, record, source)),
            priority: record.content.priority,
          });
          await draftStore.markFiled(record.id, { epic: created.key }, created.key);
          return { ok: true, epicKey: created.key, epicUrl: created.url, draftId: record.id, provenance: buildProvenance('po-agent', PO_MODEL_ID, record, source) };
        }
      }
    } catch (error) {
      return fail(error);
    }
  },
});
