import { afterEach, describe, expect, it, vi } from 'vitest';
import { DirectoryNotFoundError, FileExistsError, FileNotFoundError, PermissionError } from '@mastra/core/workspace';
import { BridgeCallError, bridgeCaller, type BridgeCaller } from './client';
import { RequestContext } from '@mastra/core/request-context';
import { createWorkspaceTools } from '@mastra/core/workspace';
import { BridgeFilesystem, BridgeSandbox } from './workspace';

function fakeCaller(handler: (op: string, args: Record<string, unknown>) => unknown) {
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const caller: BridgeCaller = {
    async call(op, args) {
      calls.push({ op, args: args as Record<string, unknown> });
      return handler(op, args as Record<string, unknown>) as never;
    },
  };
  return { caller, calls };
}

describe('BridgeFilesystem', () => {
  it('maps Mastra filesystem calls onto bridge operations', async () => {
    const { caller, calls } = fakeCaller((op) => {
      if (op === 'fs.readFile') return { content: 'hello', encoding: 'utf8' };
      if (op === 'fs.readdir') return { entries: [{ name: 'a.ts', type: 'file' }, { name: 'b.md', type: 'file' }, { name: 'src', type: 'directory' }] };
      if (op === 'fs.stat') return { name: 'a.ts', path: 'a.ts', type: 'file', size: 3, createdAt: '2026-10-01T00:00:00Z', modifiedAt: '2026-10-02T00:00:00Z' };
      if (op === 'fs.exists') return { exists: true };
      return null;
    });
    const fs = new BridgeFilesystem(caller, 'run-1');
    expect(await fs.readFile('README.md')).toBe('hello');
    await fs.writeFile('src/x.ts', 'export {}');
    await fs.writeFile('logo.png', Buffer.from([1, 2, 3]));
    expect((await fs.readdir('.', { extension: 'ts' })).map((e) => e.name)).toEqual(['a.ts', 'src']);
    expect((await fs.stat('a.ts')).modifiedAt).toBeInstanceOf(Date);
    expect(await fs.exists('a.ts')).toBe(true);
    expect(calls.map((c) => c.op)).toEqual(['fs.readFile', 'fs.writeFile', 'fs.writeFile', 'fs.readdir', 'fs.stat', 'fs.exists']);
    expect(calls[1]?.args).toMatchObject({ path: 'src/x.ts', content: 'export {}', encoding: 'utf8', overwrite: true });
    expect(calls[2]?.args).toMatchObject({ content: Buffer.from([1, 2, 3]).toString('base64'), encoding: 'base64' });
  });

  it("raises Mastra's own errors for a missing file, an existing file and a refusal", async () => {
    const failing = (code: 'not_found' | 'already_exists' | 'denied') =>
      new BridgeFilesystem(
        fakeCaller(() => {
          throw new BridgeCallError(code, code);
        }).caller,
        'run-1',
      );
    await expect(failing('not_found').stat('nope.ts')).rejects.toBeInstanceOf(FileNotFoundError);
    await expect(failing('not_found').readdir('nope')).rejects.toBeInstanceOf(DirectoryNotFoundError);
    await expect(failing('already_exists').writeFile('a.ts', 'x', { overwrite: false })).rejects.toBeInstanceOf(FileExistsError);
    await expect(failing('denied').writeFile('a.ts', 'x')).rejects.toBeInstanceOf(PermissionError);
  });
});

describe('BridgeSandbox', () => {
  it('runs a command through the bridge and returns Mastra’s command result', async () => {
    const { caller, calls } = fakeCaller(() => ({ exitCode: 1, stdout: 'FAIL 1 test', stderr: '', executionTimeMs: 900, timedOut: false, stdoutTruncated: false, stderrTruncated: false }));
    const result = await new BridgeSandbox(caller, 'run-1').executeCommand('npm', ['test'], { cwd: 'packages/web' });
    expect(calls[0]).toEqual({ op: 'sandbox.exec', args: { command: 'npm', args: ['test'], cwd: 'packages/web', timeoutMs: undefined } });
    expect(result).toMatchObject({ success: false, exitCode: 1, stdout: 'FAIL 1 test', command: 'npm', args: ['test'] });
  });
});

describe('V2 tools', () => {
  it('searches natively on the developer machine in one call', async () => {
    const { caller, calls } = fakeCaller(() => ({ files: [{ path: 'src/a.ts', matches: [{ line: 2, column: 3, text: '// TODO' }] }], truncated: false }));
    const results = await new BridgeFilesystem(caller, 'run-1').grep({ pattern: 'TODO', path: 'src', caseSensitive: true, includeHidden: false, maxTotalMatches: 1000 });
    expect(results).toEqual([{ path: 'src/a.ts', matches: [{ line: 2, column: 3, text: '// TODO' }] }]);
    expect(calls).toEqual([{ op: 'fs.grep', args: expect.objectContaining({ pattern: 'TODO', path: 'src', maxTotalMatches: 1000 }) }]);
  });

  it('runs background processes: spawn, read new output, wait for exit, find one from an earlier turn', async () => {
    let reads = 0;
    const { caller, calls } = fakeCaller((op, args) => {
      if (op === 'proc.spawn') return { pid: '42', command: String(args.command), running: true };
      if (op === 'proc.read') {
        reads++;
        return reads < 3
          ? { pid: '42', command: 'npm run dev', running: true, stdout: `line ${reads}\n`, stderr: '', stdoutOffset: reads * 7, stderrOffset: 0 }
          : { pid: '42', command: 'npm run dev', running: false, exitCode: 0, stdout: '', stderr: '', stdoutOffset: 14, stderrOffset: 0 };
      }
      if (op === 'proc.list') return { processes: [{ pid: '7', command: 'npm run e2e', running: true }] };
      if (op === 'proc.kill') return { killed: true };
      return null;
    });
    const sandbox = new BridgeSandbox(caller, 'run-1');
    const handle = await sandbox.processes.spawn('npm run dev', { cwd: 'web' });
    expect(calls[0]).toEqual({ op: 'proc.spawn', args: { command: 'npm run dev', cwd: 'web', timeoutMs: undefined } });
    const same = await sandbox.processes.get('42');
    expect(same?.stdout).toBe('line 1\n');
    expect(calls.at(-1)?.args).toMatchObject({ pid: '42', stdoutOffset: 0 });
    vi.useFakeTimers();
    try {
      const waited = handle.wait();
      await vi.runAllTimersAsync();
      expect(await waited).toMatchObject({ success: true, exitCode: 0, stdout: 'line 1\nline 2\n' });
    } finally {
      vi.useRealTimers();
    }
    const earlier = await new BridgeSandbox(caller, 'run-2').processes.get('7');
    expect(earlier?.command).toBe('npm run e2e');
    expect(await new BridgeSandbox(caller, 'run-2').processes.get('nope')).toBeUndefined();
  });

  it("gives the agent Mastra's file, search and process tools", async () => {
    const { vscodeWorkspace } = await import('../agents/vscode-agent');
    const requestContext = new RequestContext();
    requestContext.set('auraRun', { runId: 'r1', requestId: 'q', userId: 'u', role: 'developer' });
    const tools = Object.keys(await createWorkspaceTools(vscodeWorkspace as never, { requestContext } as never));
    expect(tools).toEqual(expect.arrayContaining(['mastra_workspace_grep', 'mastra_workspace_edit_file', 'mastra_workspace_execute_command', 'mastra_workspace_get_process_output', 'mastra_workspace_kill_process']));
  });
});

describe('bridgeCaller', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('posts the call to apps/api with the runtime token and returns the value', async () => {
    vi.stubEnv('AURA_API_URL', 'http://api.test/');
    vi.stubEnv('MASTRA_RUNTIME_TOKEN', 'secret');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, value: { exists: false } })));
    expect(await bridgeCaller('run-1', fetchImpl as unknown as typeof fetch).call('fs.exists', { path: 'x' })).toEqual({ exists: false });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/internal/bridge/calls');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(JSON.parse(String(init.body))).toEqual({ runId: 'run-1', op: 'fs.exists', args: { path: 'x' } });
  });

  it("sends a parallel part's worktree with every call", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, value: null })));
    await bridgeCaller('run-1', fetchImpl as unknown as typeof fetch, { worktree: 'KAN-45_s1' }).call('fs.writeFile', { path: 'a.ts', content: 'x' });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ runId: 'run-1', worktree: 'KAN-45_s1' });
  });

  it('raises the bridge error the extension or API reported', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: 'denied', message: 'The developer refused: npm install' } })));
    await expect(bridgeCaller('run-1', fetchImpl as unknown as typeof fetch).call('sandbox.exec', { command: 'npm', args: ['install'] })).rejects.toMatchObject({ code: 'denied' });
  });
});
