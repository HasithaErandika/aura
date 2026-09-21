import { registerApiRoute } from '@mastra/core/server';
import { draftStore } from '../store/draft-store';

// Read-only test-run history for an Epic (optionally one Task) - the real pass/failed/skipped
// counts and the Tester Agent's interpretation, kept as separate fields (never merged into one
// string) so a viewer can tell "machine result" from "AI interpretation" apart, the same
// separation docs/ARCHITECTURE.md section 8 requires of the UI, not just the Jira comment.

interface TestRunContent {
  epicKey: string;
  taskKey: string;
  discipline: string;
}

export const listTestRunsRoute = registerApiRoute('/test-runs/:epicKey', {
  method: 'GET',
  handler: async (c) => {
    try {
      const epicKey = c.req.param('epicKey')?.trim().toUpperCase();
      if (!epicKey) return c.json({ error: 'epicKey is required' }, 400);
      const taskKey = c.req.query('taskKey')?.trim().toUpperCase();
      const records = await draftStore.listByEpic<TestRunContent>('test-run', epicKey);
      const runs = records
        .filter((r) => r.filed.status === 'done' && (!taskKey || r.content.taskKey === taskKey))
        .map((r) => ({
          draftId: r.id,
          taskKey: r.content.taskKey,
          discipline: r.content.discipline,
          createdAt: r.createdAt,
          passed: Number(r.filed.passed ?? '0'),
          failed: Number(r.filed.failed ?? '0'),
          skipped: Number(r.filed.skipped ?? '0'),
          summary: r.filed.summary ?? null,
          failureNotes: r.filed.failureNotes ? (JSON.parse(r.filed.failureNotes) as { name: string; verdict: string; note: string }[]) : [],
        }));
      return c.json({ epicKey, runs });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  },
});
