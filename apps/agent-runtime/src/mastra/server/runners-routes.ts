import { registerApiRoute } from '@mastra/core/server';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { CONTAINER_LIMITS } from '../lib/docker-exec';
import { listActiveChecks, SANDBOX_MODE } from '../lib/sandbox';
import { listActiveCouncils } from '../workflows/coding-council';
import { listTerminalSessions } from '../terminal/server';
import { devWorkspaceRoot } from '../workspace/dev-workspace';

// GET /runners?epic= - one snapshot of everything AURA is running on this machine, for the
// Runners tab next to the web terminal: Docker containers (with live CPU/memory/PIDs against the
// fixed per-container limits), host capacity, Coding Council runs, project checks running on the
// host, and open terminal sessions. Purely observational, like docker-runs-routes.ts - nothing
// reads this to make a decision. apps/api gates who may call it and redacts other users'
// terminal sessions.

interface PsRow {
  ID: string;
  Names: string;
  Image: string;
  Status: string;
  State: string;
  RunningFor: string;
  CreatedAt: string;
  Labels: string;
}

interface StatsRow {
  Name: string;
  CPUPerc: string;
  MemUsage: string;
  MemPerc: string;
  NetIO: string;
  BlockIO: string;
  PIDs: string;
}

function docker(args: string[], timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', args);
    let out = '';
    let err = '';
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(err.trim() || `docker ${args[0]} exited ${code}`));
      else resolve(out);
    });
  });
}

function jsonLines<T>(text: string): T[] {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

function auraLabels(labels: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of labels.split(',')) {
    const [k, v] = pair.split('=');
    if (k?.startsWith('aura.') && v !== undefined) result[k.slice('aura.'.length)] = v;
  }
  return result;
}

const pct = (value: string | undefined) => {
  const n = Number.parseFloat((value ?? '').replace('%', ''));
  return Number.isFinite(n) ? n : null;
};

// "123.4MiB / 2GiB" -> bytes of the first number.
function bytes(value: string | undefined): number | null {
  const match = /([\d.]+)\s*([KMGT]?i?B)/i.exec(value ?? '');
  if (!match) return null;
  const unit = match[2]!.toUpperCase();
  const power = { B: 0, KB: 1, KIB: 1, MB: 2, MIB: 2, GB: 3, GIB: 3, TB: 4, TIB: 4 }[unit] ?? 0;
  const base = unit.includes('I') ? 1024 : 1000;
  return Math.round(Number(match[1]) * base ** power);
}

// Where a directory sits under the workspace root: "<EPIC>/dev/<discipline>[/.worktrees/<TASK>]".
function locate(dir: string): { epicKey: string | null; discipline: string | null; taskKey: string | null; label: string } {
  const rel = path.relative(path.resolve(devWorkspaceRoot), dir);
  const parts = rel.split(path.sep);
  if (rel.startsWith('..') || parts.length < 3) return { epicKey: null, discipline: null, taskKey: null, label: path.basename(dir) };
  const taskKey = parts[3] === '.worktrees' ? (parts[4] ?? null) : null;
  return { epicKey: parts[0] ?? null, discipline: parts[2] ?? null, taskKey, label: taskKey ?? `${parts[0]}/${parts[2]} base` };
}

async function dockerSnapshot(epic: string | undefined) {
  let version: string;
  try {
    version = (await docker(['version', '--format', '{{.Server.Version}}'], 4000)).trim();
  } catch (error) {
    return { engine: { available: false as const, version: null, error: error instanceof Error ? error.message.split('\n')[0] : String(error) }, containers: [] };
  }

  const filters = ['--filter', 'label=aura=true', ...(epic ? ['--filter', `label=aura.epic=${epic}`] : [])];
  const rows = jsonLines<PsRow>(await docker(['ps', '-a', ...filters, '--no-trunc', '--format', '{{json .}}', '--last', '25']));
  const running = rows.filter((r) => r.State === 'running');
  const stats = new Map<string, StatsRow>();
  if (running.length) {
    try {
      for (const row of jsonLines<StatsRow>(await docker(['stats', '--no-stream', '--format', '{{json .}}', ...running.map((r) => r.Names)]))) stats.set(row.Name, row);
    } catch {
      // A container that exited between `ps` and `stats` makes the whole call fail; show the
      // list without live numbers rather than nothing.
    }
  }

  const containers = rows.map((row) => {
    const labels = auraLabels(row.Labels);
    const s = stats.get(row.Names);
    return {
      id: row.ID.slice(0, 12),
      name: row.Names,
      image: row.Image,
      state: row.State,
      status: row.Status,
      runningFor: row.RunningFor,
      createdAt: row.CreatedAt,
      kind: labels.kind ?? null,
      epicKey: labels.epic ?? null,
      taskKey: labels.task ?? null,
      stats: s
        ? {
            cpuPercent: pct(s.CPUPerc),
            memoryBytes: bytes(s.MemUsage.split('/')[0]),
            memoryPercent: pct(s.MemPerc),
            pids: Number.parseInt(s.PIDs, 10) || 0,
            netIO: s.NetIO,
            blockIO: s.BlockIO,
          }
        : null,
    };
  });
  return { engine: { available: true as const, version, error: null }, containers };
}

export const runnersRoute = registerApiRoute('/runners', {
  method: 'GET',
  handler: async (c) => {
    const epic = c.req.query('epic')?.trim().toUpperCase() || undefined;
    const inEpic = (dir: string) => !epic || locate(dir).epicKey === epic;
    const { engine, containers } = await dockerSnapshot(epic);

    return c.json({
      generatedAt: new Date().toISOString(),
      epicKey: epic ?? null,
      host: {
        hostname: os.hostname(),
        platform: `${os.type()} ${os.release()}`,
        cpus: os.cpus().length,
        loadAverage: os.loadavg(),
        memoryTotalBytes: os.totalmem(),
        memoryFreeBytes: os.freemem(),
        uptimeSeconds: Math.round(os.uptime()),
      },
      docker: {
        ...engine,
        limits: { cpus: CONTAINER_LIMITS.cpus, memoryBytes: CONTAINER_LIMITS.memoryBytes, pids: CONTAINER_LIMITS.pids },
        containers,
      },
      sandboxMode: SANDBOX_MODE,
      councils: listActiveCouncils()
        .filter((r) => inEpic(r.dir))
        .map(({ dir, ...r }) => ({ ...r, ...locate(dir) })),
      checks: listActiveChecks()
        .filter((r) => inEpic(r.dir))
        .map(({ dir, ...r }) => ({ ...r, ...locate(dir) })),
      terminals: listTerminalSessions(),
    });
  },
});
