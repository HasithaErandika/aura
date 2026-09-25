import { spawn } from 'node:child_process';

// Runs a scaffold command inside an ephemeral Docker container - the sandbox boundary for the
// Dev agent (docs/ARCHITECTURE.md section 15, open decision #4: Docker chosen for local/solo
// use; swap for Firecracker/gVisor if this ever serves untrusted multi-tenant work). Every
// caller of runInContainer must pass a fixed, code-defined `command` - never text built from
// Jira content, a model's output, or any other untrusted input. tools/delegate-tools.ts's
// SCAFFOLD_COMMANDS table is the only place commands are chosen, and it is not agent-authored.

// Every AURA container gets the same ceiling. Structured so the Runners view
// (server/runners-routes.ts) can show usage against it, not just raw numbers.
export const CONTAINER_LIMITS = { memory: '2g', memoryBytes: 2 * 1024 ** 3, cpus: 2, pids: 512 } as const;
const RESOURCE_LIMITS = [`--memory=${CONTAINER_LIMITS.memory}`, `--cpus=${CONTAINER_LIMITS.cpus}`, `--pids-limit=${CONTAINER_LIMITS.pids}`];

// Cap on the output buffer kept for the tool's own return value; live progress still streams
// through onOutput regardless of this cap.
const OUTPUT_CAP = 20_000;

export async function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['version', '--format', '{{.Server.Version}}']);
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
  });
}

export interface ContainerMount {
  hostPath: string;
  containerPath: string;
  readOnly?: boolean;
}

export interface RunInContainerInput {
  image: string;
  hostDir: string;
  command: string;
  timeoutMs: number;
  // Extra environment for the container - passed as `-e` args to `docker run`, never
  // interpolated into `command`'s shell string. Values are not logged.
  env?: Record<string, string>;
  // Extra read-only-by-default bind mounts beyond hostDir (e.g. a coding CLI's own login
  // credentials from the host, so it runs authenticated as whoever is running AURA - see
  // delegate-tools.ts's CODING_COMMANDS. Claude Code and Codex use a browser/CLI login, not an
  // API key; there is nothing to inject as an env var).
  mounts?: ContainerMount[];
  // Names and labels this run so `docker ps --filter label=aura=true` can list it while it's
  // running (server/docker-runs-routes.ts) - purely observational, never read back by this
  // function itself. Omit `name` to let Docker assign one (still labeled and listable).
  name?: string;
  labels?: Record<string, string>;
  onOutput?: (chunk: string) => void;
}

export interface DockerRunResult {
  exitCode: number;
  output: string;
}

// Runs the container as the host user (POSIX only - process.getuid is undefined on Windows,
// where Docker Desktop's own volume-permission translation already avoids this problem) so
// scaffolded files land owned by whoever is running AURA, not root. The image's default user
// has no /etc/passwd entry for an arbitrary host UID, which leaves $HOME unset and breaks npm's
// cache directory - HOME and npm_config_cache are pinned to a writable path to avoid that.
function userArgs(): string[] {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid === undefined || gid === undefined) return [];
  return ['--user', `${uid}:${gid}`, '-e', 'HOME=/tmp', '-e', 'npm_config_cache=/tmp/.npm'];
}

export async function runInContainer(input: RunInContainerInput): Promise<DockerRunResult> {
  const extraEnv = Object.entries(input.env ?? {}).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const extraMounts = (input.mounts ?? []).flatMap((m) => ['-v', `${m.hostPath}:${m.containerPath}${m.readOnly === false ? '' : ':ro'}`]);
  const nameArgs = input.name ? ['--name', input.name] : [];
  const labelArgs = Object.entries({ aura: 'true', ...(input.labels ?? {}) }).flatMap(([k, v]) => ['--label', `${k}=${v}`]);
  const args = ['run', '--rm', ...RESOURCE_LIMITS, ...nameArgs, ...labelArgs, ...userArgs(), ...extraEnv, '-v', `${input.hostDir}:/workspace`, ...extraMounts, '-w', '/workspace', input.image, 'sh', '-c', input.command];

  return new Promise((resolve, reject) => {
    const proc = spawn('docker', args);
    let buffer = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      reject(new Error(`Docker run exceeded ${Math.round(input.timeoutMs / 1000)}s and was killed`));
    }, input.timeoutMs);

    const onChunk = (data: Buffer) => {
      const text = data.toString();
      buffer += text;
      if (buffer.length > OUTPUT_CAP) buffer = buffer.slice(-OUTPUT_CAP);
      input.onOutput?.(text);
    };
    proc.stdout.on('data', onChunk);
    proc.stderr.on('data', onChunk);

    proc.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    proc.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ exitCode: code ?? -1, output: buffer });
    });
  });
}
