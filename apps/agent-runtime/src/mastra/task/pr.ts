import { REVIEWER, shellSafe } from './git-ops';
import type { TaskPlanDraft, TaskReviewDraft } from './contracts';

// Gate 6 (plan §7 "Git agent", §10): the pull request a Task opens into `development`, its
// description with provenance (what was approved, by which gates, with what evidence), and the
// parsing of what git and gh print. Pure, so it is tested directly.

export const PR_BASE = 'development';

// The Gate 6 draft (draft kind "task-pr").
export interface TaskPrDraft {
  reviewDraftId: string;
  planDraftId: string;
  taskKey: string;
  epicKey: string | null;
  branch: string;
  base: string;
  baseRef: string | null;
  title: string;
  body: string;
  reviewers: string[];
}

export function prTitle(taskKey: string, summary: string): string {
  const s = shellSafe(summary).slice(0, 100).trim();
  return s && s !== taskKey ? `${taskKey}: ${s}` : taskKey;
}

export function validReviewers(list: unknown[]): string[] {
  return [...new Set(list.filter((r): r is string => typeof r === 'string').map((r) => r.trim().replace(/^@/, '')).filter((r) => REVIEWER.test(r)))].slice(0, 15);
}

export function prBody(input: { plan: TaskPlanDraft; review: TaskReviewDraft; reviewDraftId: string; runId: string; webUrl?: string | null; notes?: string }): string {
  const { plan, review } = input;
  const last = review.rounds.at(-1);
  const checks = last?.checks ?? [];
  const runLink = input.webUrl ? `[${input.runId}](${input.webUrl.replace(/\/+$/, '')}/app/runs/${input.runId})` : `\`${input.runId}\``;
  return [
    `## ${plan.task.taskKey}: ${plan.task.summary}`,
    '',
    plan.plan.summary,
    ...(input.notes?.trim() ? ['', input.notes.trim()] : []),
    '',
    '### What changed',
    ...plan.plan.steps.map((s, i) => `${i + 1}. ${s.title}`),
    '',
    `Files: ${review.changedFiles.length} (${review.changedFiles.slice(0, 30).map((f) => `\`${f.path}\``).join(', ')}${review.changedFiles.length > 30 ? ', …' : ''})`,
    '',
    '### Checks (run by AURA on the developer\'s machine)',
    ...(checks.length ? checks.map((c) => `- ${c.passed ? '✅' : '❌'} \`${c.command}\` (exit ${c.exitCode})`) : ['- none configured']),
    '',
    '### Provenance',
    '| | |',
    '|---|---|',
    `| Jira | ${plan.task.taskKey}${plan.task.epicKey ? ` (Epic ${plan.task.epicKey})` : ''} |`,
    `| Gate 4 plan | ${review.planDraftId}, approved by the developer |`,
    `| Coder | ${review.coder}${review.subtasks?.length ? `, ${review.subtasks.length} parallel parts (${review.subtasks.map((s) => `${s.coder}: merge ${s.merge}`).join('; ')})` : ''} |`,
    `| Evaluator | ${review.passed ? 'approved' : 'not approved'} after ${review.rounds.length} round(s)${last ? `: ${last.verdict.summary.replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 300)}` : ''} |`,
    `| Gate 5 review | ${input.reviewDraftId}, accepted by the developer |`,
    `| AURA run | ${runLink} |`,
    '',
    'CI (`aura-ci.yml`) on this pull request is the authoritative result; AURA shows it to QA.',
    '',
    '_Opened by AURA at Gate 6 after the developer approved it._',
  ].join('\n');
}

export function renderPrDraft(d: TaskPrDraft): string {
  return [
    `# Pull request for ${d.taskKey}`,
    '',
    `**${d.title}**`,
    '',
    `\`${d.branch}\` → \`${d.base}\` · Reviewers: ${d.reviewers.length ? d.reviewers.map((r) => `@${r}`).join(', ') : 'none (add them in .aura/settings.json "reviewers", or ask me)'}`,
    '',
    'On approval AURA commits the accepted change, pushes the branch and opens the pull request with this description:',
    '',
    d.body
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n'),
  ].join('\n');
}

// git@github.com:owner/repo.git, https://github.com/owner/repo(.git), ssh://git@github.com/owner/repo
export function parseRemote(url: string): string | null {
  const m = /github\.com[:/]+([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

// gh prints the PR URL on success, and the existing one in "already exists" errors.
export function parsePrUrl(text: string): { url: string; number: number } | null {
  const m = /https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+\/pull\/(\d+)/.exec(text);
  return m ? { url: m[0], number: Number(m[1]) } : null;
}

export function compareUrl(repo: string, branch: string, base = PR_BASE): string {
  return `https://github.com/${repo}/compare/${base}...${branch}?expand=1`;
}
