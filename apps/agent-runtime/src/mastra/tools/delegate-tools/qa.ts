import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { qaDraftSchema, qaFiledComment, renderTestPlan, type QaDraft, type TestScenario } from '../../contracts/qa-drafts';
import { draftStore, type DraftRecord } from '../../store/draft-store';
import { jira } from '../../mcp/jira-client';
import { QA_MODEL_ID } from '../../agents/registry';
import { generateObject, type MastraLike } from '../../lib/generate-object';
import { qaWorkspace } from '../../workspace/qa-workspace';
import { devWorkspaceDir } from '../../workspace/dev-workspace';
import { readScaffoldContext } from '../../workspace/read-scaffold-context';
import type { WorkspaceRegistry } from '../../workspace/architect-workspace';
import { provenance, buildProvenance, type ProvenanceStamp, type ToolWriterLike } from './shared';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

interface QaWorkflowStreamOutput {
  fullStream: AsyncIterable<{ type: string; id?: string; payload?: { status?: string; id?: string } }>;
  result: Promise<{ status: string; result?: unknown; error?: { message?: string } }>;
}
interface QaWorkflowRun {
  stream: (args: { inputData: { epicKey: string; epicSummary: string; storiesText: string; codeContext: string } }) => QaWorkflowStreamOutput;
}
interface QaWorkflowLike {
  createRun: () => Promise<QaWorkflowRun>;
}
type QaMastra = (MastraLike & { getWorkflow?: (id: string) => QaWorkflowLike } & Partial<WorkspaceRegistry>) | undefined;

// Runs the QA Workflow, relaying each step's start/result into this tool's own stream, the same
// pattern as runArchitectWorkflow (architect.ts).
async function runQaWorkflow(mastra: QaMastra, input: { epicKey: string; epicSummary: string; storiesText: string; codeContext: string }, writer: ToolWriterLike | undefined): Promise<QaDraft> {
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
    mode: z.enum(['draft', 'revise', 'revise-scenario', 'file']),
    epicKey: z.string().optional().describe('draft: the Epic whose approved Stories to write a test plan for'),
    draftId: z.string().optional().describe('revise, revise-scenario, and file: the draftId returned earlier'),
    feedback: z.string().optional().describe('revise and revise-scenario: the feedback (human wording, or real test-failure evidence), verbatim'),
    fileName: z
      .string()
      .optional()
      .describe('revise-scenario only: the kebab-case fileName (no extension) of the ONE scenario to regenerate - every other scenario is left byte-identical'),
    approved: z.boolean().optional().describe('file: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const qaOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('draft/revise: the human-readable draft, show it verbatim. file: a note on which scenarios were copied into the scaffolded project(s), if any - show it if present.'),
  epicKey: z.string().optional(),
  scenarioCount: z.number().optional(),
  revisedFile: z.string().optional().describe('revise-scenario: which .spec.ts file was regenerated'),
  error: z.string().optional(),
  provenance: z.custom<ProvenanceStamp>().optional(),
});

function qaFail(error: unknown): z.infer<typeof qaOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

// Copies each scenario's spec into the matching scaffolded discipline's own test directory, so a
// developer's plain `npm test`/CI (Gate 3's addition) run the exact same files this Epic's real
// QA workspace owns - not a replacement for the canonical copy above (Gate 7 keeps reading from
// there unchanged), just an extra, best-effort convenience copy. Skipped per-discipline when that
// discipline hasn't been scaffolded yet (Gate 4 hasn't run) - never blocks or fails the file step
// itself, and always says plainly which scenarios were and weren't copied.
async function copyScenariosIntoScaffold(epicKey: string, scenarios: QaDraft['scenarios']): Promise<string> {
  const notes: string[] = [];
  for (const discipline of ['Frontend', 'Backend'] as const) {
    const matching = scenarios.filter((s) => (discipline === 'Frontend' ? s.type === 'ui' : s.type === 'api'));
    if (!matching.length) continue;
    const targetDir = await devWorkspaceDir(epicKey, discipline);
    try {
      await access(targetDir);
    } catch {
      notes.push(`${discipline} not scaffolded yet - its ${matching.length} scenario(s) stay only in the QA workspace until Gate 4 runs for it.`);
      continue;
    }
    const testsDir = discipline === 'Frontend' ? path.join(targetDir, 'tests') : path.join(targetDir, 'test', 'e2e');
    try {
      await mkdir(testsDir, { recursive: true });
      for (const scenario of matching) {
        await writeFile(path.join(testsDir, `${scenario.fileName}.spec.ts`), scenario.playwrightSource, 'utf8');
      }
      notes.push(`${discipline}: copied ${matching.length} scenario(s) into ${discipline === 'Frontend' ? 'tests/' : 'test/e2e/'}.`);
    } catch (error) {
      notes.push(`${discipline}: could not copy scenarios in - ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return notes.join(' ');
}

export interface QaScenarioRevision {
  record: DraftRecord<QaDraft>;
  scenario: TestScenario;
}

// Regenerates exactly ONE scenario's Playwright source from real failure evidence, leaving
// every other scenario in the draft byte-identical (docs/ARCHITECTURE.md's Tester Agent loop:
// "only the failing scenario may be modified" - a full-plan revise regenerating all 30 scenarios
// because one failed would put stable, passing tests at risk of unnecessary AI churn for no
// reason). Exported so both this tool's own `revise-scenario` mode (a human asking QA to fix one
// test by hand) and workflows/tester-workflow.ts (the automated loop, bypassing the tool/approval
// wrapper the same way delegate-tools/code.ts's runCodingFix does - Gate 7's own human approval
// already covers bounded retries within its loop) share one implementation instead of two.
export async function reviseQaScenario(mastra: MastraLike, previous: DraftRecord<QaDraft>, fileName: string, feedback: string): Promise<QaScenarioRevision> {
  const target = previous.content.scenarios.find((s) => s.fileName === fileName);
  if (!target) throw new Error(`no scenario named "${fileName}" in draft ${previous.id}`);

  const prompt = [
    `This Playwright test is failing for real, against the actual application. Fix ONLY this test file - do not change its intent (same Story/Stories, same title/type) unless the evidence below shows the Story itself is being tested against the wrong thing.`,
    '',
    `Scenario: ${target.title} (${target.type})`,
    `Tests Story/Stories: ${target.storyKeys.join(', ')}`,
    '',
    'Current source:',
    target.playwrightSource,
    '',
    'Failure evidence:',
    feedback,
    '',
    'Return only the JSON the schema describes - one field, playwrightSource, containing the complete corrected file content (imports included).',
  ].join('\n');
  const { playwrightSource } = await generateObject(mastra, 'qa', prompt, z.object({ playwrightSource: z.string().min(20) }));

  const revisedScenario: TestScenario = { ...target, playwrightSource, revision: target.revision + 1, revisionNote: feedback };
  const content: QaDraft = { ...previous.content, scenarios: previous.content.scenarios.map((s) => (s.fileName === fileName ? revisedScenario : s)) };
  const record = await draftStore.create({ kind: 'qa-plan', content, threadId: previous.threadId, epicKey: previous.epicKey, parentId: previous.id });
  // Every other scenario's Jira-workspace file is already correct on disk (untouched) - carry the
  // previous filed markers forward so `file`-equivalent bookkeeping doesn't think nothing is filed.
  await draftStore.markFiled(record.id, { ...previous.filed });

  if (previous.epicKey) {
    try {
      const workspaceRegistry = mastra as QaMastra;
      const fs = workspaceRegistry?.listWorkspaces && workspaceRegistry.addWorkspace ? qaWorkspace(workspaceRegistry as WorkspaceRegistry, previous.epicKey).filesystem : null;
      if (fs) await fs.writeFile(`tests/${fileName}.spec.ts`, playwrightSource, { recursive: true, overwrite: true });
    } catch {
      // Best-effort - the scaffold copy below is what Gate 7 actually reads from.
    }
    await copyScenariosIntoScaffold(previous.epicKey, [revisedScenario]);
  }

  return { record, scenario: revisedScenario };
}

export const delegateToQaTool = createTool({
  id: 'delegate_to_qa',
  description:
    "QA Agent (Gate 6). draft: epicKey -> a test plan and real Playwright source generated from the Epic's approved Stories (and, if scaffolded/implemented, the actual code - so selectors/routes are real, not guessed). revise: draftId + feedback -> new draftId + markdown, regenerating every scenario. revise-scenario: draftId + fileName + feedback -> regenerates ONLY that one scenario's Playwright source from real failure evidence, leaving every other scenario untouched (this is what the Tester Agent loop calls when it diagnoses a bad test, not a code bug). file: draftId + approved -> test-plan.md and one .spec.ts file per scenario written to the QA workspace, commented on the Epic (returns scenarioCount). Never file without an explicit human approval. Requires the Epic to already have approved Stories filed (run delegate_to_ba first).",
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
          const codeContext = await readScaffoldContext(epicKey);
          const content = await runQaWorkflow(mastra as QaMastra, { epicKey, epicSummary: epic.summary, storiesText, codeContext }, writer);
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
        case 'revise-scenario': {
          if (!input.draftId || !input.fileName?.trim() || !input.feedback?.trim()) return qaFail('revise-scenario needs draftId, fileName, and feedback');
          const previous = await draftStore.get<QaDraft>(input.draftId);
          if (!previous || previous.kind !== 'qa-plan') return qaFail(`unknown QA draft ${input.draftId}`);
          const { record, scenario } = await reviseQaScenario(mastra as MastraLike, previous, input.fileName.trim(), input.feedback.trim());
          return {
            ok: true,
            draftId: record.id,
            markdown: `Regenerated only \`tests/${scenario.fileName}.spec.ts\` (revision ${scenario.revision}). Every other scenario is unchanged.`,
            epicKey: record.epicKey ?? undefined,
            scenarioCount: record.content.scenarios.length,
            revisedFile: scenario.fileName,
          };
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

          if (!filed.scaffoldCopy) {
            filed.scaffoldCopy = await copyScenariosIntoScaffold(epicKey, record.content.scenarios);
            await draftStore.markFiled(record.id, filed);
          }

          if (!filed.comment) {
            try {
              const stamp = provenance('qa-agent', QA_MODEL_ID, record, `${epicKey} (Epic)`);
              const scenarioPaths = record.content.scenarios.map((s) => `tests/${s.fileName}.spec.ts`);
              await jira.addComment(epicKey, qaFiledComment(record.content, 'test-plan.md', scenarioPaths, stamp));
              filed.comment = 'done';
              await draftStore.markFiled(record.id, filed);
            } catch {
              // The comment is informational; the workspace files are what matters.
            }
          }
          return {
            ok: true,
            draftId: record.id,
            epicKey,
            scenarioCount: record.content.scenarios.length,
            markdown: filed.scaffoldCopy || undefined,
            provenance: buildProvenance('qa-agent', QA_MODEL_ID, record, `${epicKey} (Epic)`),
          };
        }
      }
    } catch (error) {
      return qaFail(error);
    }
  },
});
