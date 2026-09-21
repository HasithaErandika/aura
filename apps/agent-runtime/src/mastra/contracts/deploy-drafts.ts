import { z } from 'zod';

// The Deployer Agent's plan (Gate 8) - plan-only, on purpose. There is no real deployment
// pipeline in this repo (docs/ARCHITECTURE.md section 12 is target-state, not built), so this
// agent never claims a release happened (principle 5, "evidence over assertion"). It prepares
// what a human needs to execute the release themselves: release notes, a change plan, and a
// rollback plan. There is deliberately no `execute` mode on delegate_to_deploy - see
// tools/delegate-tools.ts.

export const deployDraftSchema = z.object({
  epicKey: z.string().min(1),
  releaseNotes: z.string().min(10).describe('Human-readable summary of what shipped, written from the filed Tasks - for release announcements/changelogs'),
  changePlan: z.array(z.string().min(1)).min(1).describe('Ordered steps a human runs to release this - specific to what actually changed, not generic boilerplate'),
  rollbackPlan: z.array(z.string().min(1)).min(1).describe('Ordered steps to revert this release if something goes wrong'),
  risks: z.array(z.string().min(1)).describe('Risks or open questions a releaser should know before running the change plan'),
});
export type DeployDraft = z.infer<typeof deployDraftSchema>;

const DEPLOYER_PERSPECTIVE =
  '*Drafted by the AURA Deployer Agent, from a release-readiness perspective: what shipped, how to release it, and how to undo it - this plan is prepared for a human to execute; AURA does not run a real deployment.*';

function bullets(items: string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : '- none';
}

export function renderDeployPlan(draft: DeployDraft): string {
  return [
    `# Release plan for ${draft.epicKey}`,
    '',
    DEPLOYER_PERSPECTIVE,
    '',
    '## Release notes',
    draft.releaseNotes,
    '',
    '## Change plan',
    draft.changePlan.map((step, i) => `${i + 1}. ${step}`).join('\n'),
    '',
    '## Rollback plan',
    draft.rollbackPlan.map((step, i) => `${i + 1}. ${step}`).join('\n'),
    '',
    '## Risks and open questions',
    bullets(draft.risks),
  ].join('\n');
}

export function deployFiledComment(draft: DeployDraft, stamp: string): string {
  return [
    'AURA Deployer Agent filed a release plan for this Epic - release notes, a change plan, and a rollback plan.',
    'This is a plan for a human to execute: AURA has not deployed anything and does not claim to.',
    '',
    renderDeployPlan(draft).replace(/^# .*\n\n.*\n\n/, ''),
    '',
    '----',
    stamp,
  ].join('\n');
}
