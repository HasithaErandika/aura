import { registerApiRoute } from '@mastra/core/server';
import { spawn } from 'node:child_process';

// Read-only visibility into which Gate 4/5/7 Docker containers are currently running or
// recently ran (docs/ARCHITECTURE.md section 6.4/6.5's containers are all labeled `aura=true`
// by lib/docker-exec.ts). Purely observational - never used by any tool to decide anything,
// so it can't become a second source of truth for run state (that stays the draft store + Jira).

interface DockerPsRow {
  ID: string;
  Names: string;
  Image: string;
  Status: string;
  State: string;
  RunningFor: string;
  Labels: string;
}

function runDockerPs(epic?: string): Promise<DockerPsRow[]> {
  return new Promise((resolve, reject) => {
    const filters = ['--filter', 'label=aura=true'];
    if (epic) filters.push('--filter', `label=aura.epic=${epic}`);
    const proc = spawn('docker', ['ps', '-a', ...filters, '--no-trunc', '--format', '{{json .}}', '--last', '20']);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `docker ps exited ${code}`));
      const rows = out
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as DockerPsRow);
      resolve(rows);
    });
  });
}

// Turns Docker's flat "k=v,k2=v2" Labels string into an object, keeping only AURA's own
// aura.* labels (drops Docker's own default labels).
function parseAuraLabels(labels: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of labels.split(',')) {
    const [k, v] = pair.split('=');
    if (k?.startsWith('aura.') && v !== undefined) result[k.slice('aura.'.length)] = v;
  }
  return result;
}

export const listDockerRunsRoute = registerApiRoute('/docker/runs', {
  method: 'GET',
  handler: async (c) => {
    try {
      const epic = c.req.query('epic')?.trim().toUpperCase() || undefined;
      const rows = await runDockerPs(epic);
      const runs = rows.map((row) => ({
        id: row.ID,
        name: row.Names,
        image: row.Image,
        status: row.Status,
        state: row.State,
        runningFor: row.RunningFor,
        ...parseAuraLabels(row.Labels),
      }));
      return c.json({ runs });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  },
});
