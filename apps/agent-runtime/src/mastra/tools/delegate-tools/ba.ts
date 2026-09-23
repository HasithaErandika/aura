import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { renderStories, storiesDraftSchema, storyJiraDescription, type StoriesDraft } from '../../contracts/drafts';
import { draftStore } from '../../store/draft-store';
import { jira, jiraIssueUrl } from '../../mcp/jira-client';
import { BA_MODEL_ID } from '../../agents/registry';
import { generateObject, type MastraLike } from '../../lib/generate-object';
import { outputSchema, fail, provenance, buildProvenance } from './shared';

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
            const stamp = provenance('ba-agent', BA_MODEL_ID, record, `${previous.content.epicKey} (Epic)`);
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
          return {
            ok: true,
            draftId: record.id,
            markdown: renderStories(content),
            epicKey: previous.content.epicKey,
            provenance: filedIndices.length ? buildProvenance('ba-agent', BA_MODEL_ID, record, `${previous.content.epicKey} (Epic)`) : undefined,
          };
        }
        // Files the approved Stories as Jira Stories under the Epic.
        case 'file': {
          if (!input.draftId) return fail('file needs draftId');
          if (input.approved !== true) return fail('file requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<StoriesDraft>(input.draftId);
          if (!record || record.kind !== 'stories') return fail(`unknown stories draft ${input.draftId}`);
          const epicKey = record.content.epicKey;
          const filed = { ...record.filed };
          const stamp = provenance('ba-agent', BA_MODEL_ID, record, `${epicKey} (Epic)`);
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
          return { ok: true, draftId: record.id, epicKey, epicUrl: jiraIssueUrl(epicKey), storyKeys, provenance: buildProvenance('ba-agent', BA_MODEL_ID, record, `${epicKey} (Epic)`) };
        }
      }
    } catch (error) {
      return fail(error);
    }
  },
});
