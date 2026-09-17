import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  epicDraftSchema,
  epicJiraDescription,
  renderEpic,
  renderStories,
  storiesDraftSchema,
  storyJiraDescription,
  type EpicDraft,
  type StoriesDraft,
} from '../contracts/drafts';
import { draftStore, type DraftRecord } from '../store/draft-store';
import { jira, jiraIssueUrl } from '../mcp/jira-client';

// The Orchestrator's only way to reach the PO and BA agents and, after human approval, Jira.
//
// Token discipline: a draft is generated once, stored, and referred to by id from then on. The
// Orchestrator never re-types a draft into a tool call. Filing is deterministic code that reads
// the stored draft, so what the human approved is exactly what lands in Jira, and a retry after
// a partial failure creates nothing twice.

const outputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional().describe('Id of the draft to pass back for revise or file.'),
  markdown: z.string().optional().describe('Human-readable draft. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  epicUrl: z.string().nullable().optional(),
  storyKeys: z.array(z.string()).optional(),
  error: z.string().optional(),
});
type DelegateOutput = z.infer<typeof outputSchema>;

interface AgentLike {
  generate: (prompt: string, options: Record<string, unknown>) => Promise<{ object?: unknown; text?: string }>;
}
type MastraLike = { getAgent: (id: string) => AgentLike } | undefined;

function fail(error: unknown): DelegateOutput {
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message };
}

async function generateObject<T>(mastra: MastraLike, agentId: string, prompt: string, schema: z.ZodType<T>): Promise<T> {
  const agent = mastra?.getAgent(agentId);
  if (!agent) throw new Error(`agent "${agentId}" is not registered`);
  const attempt = async () => {
    const result = await agent.generate(prompt, {
      structuredOutput: { schema, jsonPromptInjection: true, errorStrategy: 'strict' },
      maxSteps: 1,
    });
    const parsed = schema.safeParse(result.object ?? tryParseJson(result.text));
    if (!parsed.success) throw new Error(`${agentId} returned an invalid draft: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
    return parsed.data;
  };
  try {
    return await attempt();
  } catch (first) {
    // One retry covers the occasional malformed JSON from a small model.
    try {
      return await attempt();
    } catch {
      throw first;
    }
  }
}

function tryParseJson(text: string | undefined): unknown {
  if (!text) return undefined;
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]);
  } catch {
    return undefined;
  }
}

function provenance(agent: string, draft: DraftRecord): string {
  return `Created by AURA ${agent} (draft ${draft.id}, version ${draft.version}) after human approval in the AURA Orchestrator.`;
}

const poInputSchema = z.object({
  mode: z.enum(['draft', 'revise', 'file']),
  requirement: z.string().optional().describe('draft: the business requirement, verbatim from the user'),
  stakeholders: z.string().optional().describe('draft: stakeholder list if the user gave one'),
  draftId: z.string().optional().describe('revise and file: the draftId returned earlier'),
  feedback: z.string().optional().describe('revise: the human feedback, verbatim'),
  approved: z.boolean().optional().describe('file: must be true; set only after ask_user returned an approval'),
});

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
        case 'draft': {
          if (!input.requirement?.trim()) return fail('draft needs the requirement text');
          const prompt = `Draft an Epic for this business requirement.\n\nRequirement:\n${input.requirement.trim()}${input.stakeholders ? `\n\nStakeholders given by the requester:\n${input.stakeholders}` : ''}`;
          const content = await generateObject<EpicDraft>(mastra as MastraLike, 'po', prompt, epicDraftSchema);
          const record = await draftStore.create({ kind: 'epic', content, threadId });
          return { ok: true, draftId: record.id, markdown: renderEpic(content) };
        }
        case 'revise': {
          if (!input.draftId || !input.feedback?.trim()) return fail('revise needs draftId and feedback');
          const previous = await draftStore.get<EpicDraft>(input.draftId);
          if (!previous || previous.kind !== 'epic') return fail(`unknown epic draft ${input.draftId}`);
          const prompt = `Revise this Epic draft according to the feedback. Return the complete updated Epic.\n\nCurrent draft (JSON):\n${JSON.stringify(previous.content)}\n\nFeedback:\n${input.feedback.trim()}`;
          const content = await generateObject<EpicDraft>(mastra as MastraLike, 'po', prompt, epicDraftSchema);
          const record = await draftStore.create({ kind: 'epic', content, threadId, parentId: previous.id });
          return { ok: true, draftId: record.id, markdown: renderEpic(content) };
        }
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
            description: epicJiraDescription(record.content, provenance('PO Agent', record)),
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

const baInputSchema = z.object({
  mode: z.enum(['draft', 'revise', 'file']),
  epicKey: z.string().optional().describe('draft: key of the approved, filed Epic'),
  draftId: z.string().optional().describe('revise and file: the draftId returned earlier'),
  feedback: z.string().optional().describe('revise: the human feedback, verbatim'),
  approved: z.boolean().optional().describe('file: must be true; set only after ask_user returned an approval'),
});

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
        case 'revise': {
          if (!input.draftId || !input.feedback?.trim()) return fail('revise needs draftId and feedback');
          const previous = await draftStore.get<StoriesDraft>(input.draftId);
          if (!previous || previous.kind !== 'stories') return fail(`unknown stories draft ${input.draftId}`);
          const prompt = `Revise these Stories according to the feedback. Return the complete updated set. Keep epicKey "${previous.content.epicKey}".\n\nCurrent draft (JSON):\n${JSON.stringify(previous.content)}\n\nFeedback:\n${input.feedback.trim()}`;
          const content = await generateObject<StoriesDraft>(mastra as MastraLike, 'ba', prompt, storiesDraftSchema);
          content.epicKey = previous.content.epicKey;
          const record = await draftStore.create({ kind: 'stories', content, threadId, epicKey: previous.epicKey, parentId: previous.id });
          return { ok: true, draftId: record.id, markdown: renderStories(content), epicKey: previous.content.epicKey };
        }
        case 'file': {
          if (!input.draftId) return fail('file needs draftId');
          if (input.approved !== true) return fail('file requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<StoriesDraft>(input.draftId);
          if (!record || record.kind !== 'stories') return fail(`unknown stories draft ${input.draftId}`);
          const epicKey = record.content.epicKey;
          const filed = { ...record.filed };
          const stamp = provenance('BA Agent', record);
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
