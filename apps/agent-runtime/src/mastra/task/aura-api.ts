// The Task's pull request in AURA (apps/api /internal/task-prs, migration 0012): Gate 6 records
// the PR it opened so QA can follow it, and the VS Code agent reads back its CI result.

export interface TaskPrRecord {
  taskKey: string;
  epicKey: string | null;
  repo: string | null;
  branch: string;
  baseSha: string;
  headSha: string | null;
  prNumber: number | null;
  prUrl: string | null;
  title: string;
  reviewers: string[];
  runId: string | null;
}

export interface TaskPrState {
  taskKey: string;
  branch: string;
  repo: string | null;
  prNumber: number | null;
  prUrl: string | null;
  prTitle: string | null;
  prState: string | null;
  reviewers: string[];
  ciState: 'pending' | 'running' | 'success' | 'failure' | 'cancelled' | null;
  ciUrl: string | null;
  ciSummary: { jobs?: { name: string; result: string }[]; tests?: { passed: number; failed: number; skipped: number } };
  ciUpdatedAt: string | null;
}

function api(path: string): { url: string; headers: Record<string, string> } {
  const token = process.env.MASTRA_RUNTIME_TOKEN?.trim();
  const base = (process.env.AURA_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  return { url: `${base}/internal/task-prs${path}`, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } };
}

export async function recordTaskPr(record: TaskPrRecord, fetchImpl: typeof fetch = fetch): Promise<TaskPrState> {
  const { url, headers } = api('');
  const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(record) });
  if (!res.ok) throw new Error(`AURA could not record the pull request (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { taskPr: TaskPrState }).taskPr;
}

export async function readTaskPr(taskKey: string, fetchImpl: typeof fetch = fetch): Promise<TaskPrState | null> {
  const { url, headers } = api(`/${encodeURIComponent(taskKey)}`);
  const res = await fetchImpl(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`AURA could not read the pull request (${res.status})`);
  return ((await res.json()) as { taskPr: TaskPrState }).taskPr;
}

export function renderPrStatus(pr: TaskPrState): string {
  const jobs = pr.ciSummary.jobs ?? [];
  const tests = pr.ciSummary.tests;
  const ci = pr.ciState === null ? 'no CI result yet' : pr.ciState === 'success' ? '✅ CI passed' : pr.ciState === 'failure' ? '❌ CI failed' : pr.ciState === 'cancelled' ? 'CI cancelled' : `CI ${pr.ciState}`;
  return [
    `# ${pr.taskKey}: ${pr.prNumber ? `pull request #${pr.prNumber}` : 'branch pushed, no pull request recorded yet'}`,
    '',
    ...(pr.prUrl ? [pr.prUrl, ''] : []),
    `**${ci}**${pr.ciUrl ? ` ([run](${pr.ciUrl}))` : ''}`,
    ...(jobs.length ? ['', ...jobs.map((j) => `- ${j.result === 'success' ? '✅' : j.result === 'failure' ? '❌' : '•'} ${j.name}: ${j.result}`)] : []),
    ...(tests ? ['', `Tests: ${tests.passed} passed, ${tests.failed} failed, ${tests.skipped} skipped`] : []),
  ].join('\n');
}
