import type {
  CommandResult,
  CopyOptions,
  ExecuteCommandOptions,
  FileContent,
  FileEntry,
  FileStat,
  FilesystemGrepOptions,
  FilesystemGrepResult,
  ListOptions,
  ProcessInfo,
  ReadOptions,
  RemoveOptions,
  SpawnProcessOptions,
  WorkspaceFilesystem,
  WorkspaceSandbox,
  WriteOptions,
} from '@mastra/core/workspace';
import { DirectoryNotFoundError, FileExistsError, FileNotFoundError, PermissionError, ProcessHandle, SandboxProcessManager } from '@mastra/core/workspace';
import type { BridgeCaller } from './client';
import { BridgeCallError } from './client';

// A Mastra Workspace whose files and commands live on the developer's machine (ADR-4). Each
// method is one bridge call: the AURA VS Code extension runs it inside the open folder after its
// own permission check, and returns the result. Mastra builds its standard workspace tools
// (read_file, write_file, list_files, execute_command, …) on top of these, so agents use them
// exactly like a local workspace.

function toText(content: FileContent): { content: string; encoding: 'utf8' | 'base64' } {
  if (typeof content === 'string') return { content, encoding: 'utf8' };
  return { content: Buffer.from(content).toString('base64'), encoding: 'base64' };
}

// Mastra's workspace tools rely on its own error classes (a write checks for a missing file
// first, a refusal must read as a permission error). Bridge error codes map onto them.
function mastraError(path: string, operation: string, kind: 'file' | 'directory' = 'file') {
  return (error: unknown): never => {
    if (error instanceof BridgeCallError) {
      if (error.code === 'not_found') throw kind === 'directory' ? new DirectoryNotFoundError(path) : new FileNotFoundError(path);
      if (error.code === 'already_exists') throw new FileExistsError(path);
      if (error.code === 'denied' || error.code === 'outside_workspace') {
        const e = new PermissionError(path, operation);
        e.message = `${error.message} (${operation} ${path})`;
        throw e;
      }
    }
    throw error;
  };
}

export class BridgeFilesystem implements WorkspaceFilesystem {
  readonly id: string;
  readonly name = 'VS Code';
  readonly provider = 'aura-vscode';
  readonly displayName = "Developer's VS Code workspace";
  readonly description = "Files in the folder open in the developer's VS Code, through the AURA extension";
  status = 'ready' as const;

  constructor(
    private readonly bridge: BridgeCaller,
    runId: string,
  ) {
    this.id = `vscode-fs-${runId}`;
  }

  getInstructions(): string {
    return "Files are in the developer's VS Code workspace. Paths are relative to the workspace folder. Writes may wait for the developer's approval or be refused.";
  }

  async readFile(path: string, options?: ReadOptions): Promise<string | Buffer> {
    const binary = options?.encoding !== undefined && options.encoding !== 'utf8' && options.encoding !== 'utf-8';
    const r = await this.bridge.call('fs.readFile', { path, encoding: binary ? 'base64' : 'utf8' }).catch(mastraError(path, 'read'));
    return r.encoding === 'base64' && binary ? Buffer.from(r.content, 'base64') : r.encoding === 'base64' ? Buffer.from(r.content, 'base64').toString('utf8') : r.content;
  }

  async writeFile(path: string, content: FileContent, options?: WriteOptions): Promise<void> {
    await this.bridge.call('fs.writeFile', { path, ...toText(content), overwrite: options?.overwrite ?? true }).catch(mastraError(path, 'write'));
  }

  async appendFile(path: string, content: FileContent): Promise<void> {
    await this.bridge.call('fs.appendFile', { path, content: typeof content === 'string' ? content : Buffer.from(content).toString('utf8') }).catch(mastraError(path, 'write'));
  }

  async deleteFile(path: string, options?: RemoveOptions): Promise<void> {
    await this.bridge.call('fs.deleteFile', { path, force: options?.force }).catch(mastraError(path, 'delete'));
  }

  async copyFile(src: string, dest: string, options?: CopyOptions): Promise<void> {
    await this.bridge.call('fs.copyFile', { src, dest, overwrite: options?.overwrite }).catch(mastraError(src, 'copy'));
  }

  async moveFile(src: string, dest: string, options?: CopyOptions): Promise<void> {
    await this.bridge.call('fs.moveFile', { src, dest, overwrite: options?.overwrite }).catch(mastraError(src, 'move'));
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.bridge.call('fs.mkdir', { path, recursive: options?.recursive ?? true }).catch(mastraError(path, 'mkdir', 'directory'));
  }

  async rmdir(path: string, options?: RemoveOptions): Promise<void> {
    await this.bridge.call('fs.rmdir', { path, recursive: options?.recursive, force: options?.force }).catch(mastraError(path, 'rmdir', 'directory'));
  }

  async readdir(path: string, options?: ListOptions): Promise<FileEntry[]> {
    const r = await this.bridge.call('fs.readdir', { path, recursive: options?.recursive }).catch(mastraError(path, 'list', 'directory'));
    const extensions = options?.extension === undefined ? null : ([] as string[]).concat(options.extension).map((e) => (e.startsWith('.') ? e : `.${e}`));
    return extensions ? r.entries.filter((e) => e.type === 'directory' || extensions.some((x) => e.name.endsWith(x))) : r.entries;
  }

  async exists(path: string): Promise<boolean> {
    return (await this.bridge.call('fs.exists', { path }).catch(mastraError(path, 'read'))).exists;
  }

  // Searched on the developer's machine in one call, instead of Mastra reading every file over
  // the bridge.
  async grep(options: FilesystemGrepOptions): Promise<FilesystemGrepResult[]> {
    const r = await this.bridge
      .call('fs.grep', {
        pattern: options.pattern,
        path: options.path,
        caseSensitive: options.caseSensitive,
        includeHidden: options.includeHidden,
        maxCountPerFile: options.maxCountPerFile,
        maxTotalMatches: options.maxTotalMatches,
        contextLines: options.contextLines,
      })
      .catch(mastraError(options.path, 'grep', 'directory'));
    return r.files;
  }

  async stat(path: string): Promise<FileStat> {
    const s = await this.bridge.call('fs.stat', { path }).catch(mastraError(path, 'stat'));
    return { name: s.name, path: s.path, type: s.type, size: s.size, createdAt: new Date(s.createdAt), modifiedAt: new Date(s.modifiedAt) };
  }
}

// How often a waiting background process is polled for new output.
const POLL_MS = 1000;

// A background process running on the developer's machine. Output is fetched when someone looks
// (get_process_output) or waits, never polled in the background, so an idle dev server costs no
// bridge calls.
export class BridgeProcessHandle extends ProcessHandle {
  exitCode: number | undefined;
  private stdoutOffset = 0;
  private stderrOffset = 0;
  private readonly startedAt = Date.now();

  constructor(
    private readonly bridge: BridgeCaller,
    readonly pid: string,
    command: string,
    options?: SpawnProcessOptions,
  ) {
    super(options);
    this.command = command;
  }

  // Pulls the output produced since the last read.
  async refresh(): Promise<void> {
    const r = await this.bridge.call('proc.read', { pid: this.pid, stdoutOffset: this.stdoutOffset, stderrOffset: this.stderrOffset });
    this.stdoutOffset = r.stdoutOffset;
    this.stderrOffset = r.stderrOffset;
    if (r.stdout) this.emitStdout(r.stdout);
    if (r.stderr) this.emitStderr(r.stderr);
    if (!r.running) this.exitCode = r.exitCode ?? 1;
  }

  override async wait(): Promise<CommandResult> {
    while (this.exitCode === undefined) {
      await this.refresh();
      if (this.exitCode === undefined) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    return { success: this.exitCode === 0, exitCode: this.exitCode, stdout: this.stdout, stderr: this.stderr, executionTimeMs: Date.now() - this.startedAt, command: this.command };
  }

  async kill(): Promise<boolean> {
    return (await this.bridge.call('proc.kill', { pid: this.pid })).killed;
  }

  async sendStdin(): Promise<void> {
    throw new Error("Background processes on the developer's machine don't take input");
  }
}

export class BridgeProcessManager extends SandboxProcessManager {
  constructor(private readonly bridge: BridgeCaller) {
    super();
  }

  override async spawn(command: string, options: SpawnProcessOptions = {}): Promise<ProcessHandle> {
    const info = await this.bridge.call('proc.spawn', { command, cwd: options.cwd, timeoutMs: options.timeout });
    const handle = new BridgeProcessHandle(this.bridge, info.pid, command, options);
    this._tracked.set(info.pid, handle);
    return handle;
  }

  override async list(): Promise<ProcessInfo[]> {
    return (await this.bridge.call('proc.list', {} as never)).processes.map((p) => ({ pid: p.pid, command: p.command, running: p.running, exitCode: p.exitCode }));
  }

  // Each turn is a new run with a new manager, so a process started in an earlier turn is looked
  // up on the developer's machine. Either way the output is brought up to date first.
  override async get(pid: string): Promise<ProcessHandle | undefined> {
    let handle = this._tracked.get(pid) as BridgeProcessHandle | undefined;
    if (!handle) {
      const known = (await this.list()).find((p) => p.pid === pid);
      if (!known) return undefined;
      handle = new BridgeProcessHandle(this.bridge, pid, known.command ?? '');
      this._tracked.set(pid, handle);
    }
    await handle.refresh().catch(() => undefined);
    return handle;
  }
}

export class BridgeSandbox implements WorkspaceSandbox {
  readonly id: string;
  readonly name = 'VS Code';
  readonly provider = 'aura-vscode';
  status = 'running' as const;
  readonly processes: BridgeProcessManager;

  constructor(
    private readonly bridge: BridgeCaller,
    runId: string,
  ) {
    this.id = `vscode-sandbox-${runId}`;
    this.processes = new BridgeProcessManager(bridge);
    this.processes.sandbox = this as never;
  }

  getInstructions(): string {
    return "Commands run in the developer's VS Code workspace folder on their own machine. Each command may wait for the developer's approval, and some are always refused (force pushes, deleting outside the folder, piping downloads into a shell). Prefer the project's own scripts (npm test, npm run lint). Use background: true for dev servers and anything that runs longer than a few minutes, then read it with get_process_output.";
  }

  async ensureRunning(): Promise<void> {
    // Always running: the developer's machine.
  }

  async snapshot(): Promise<void> {
    // Nothing to snapshot: the developer's machine is the state.
  }

  async executeCommand(command: string, args: string[] = [], options?: ExecuteCommandOptions): Promise<CommandResult> {
    const r = await this.bridge.call('sandbox.exec', { command, args, cwd: options?.cwd, timeoutMs: options?.timeout }, options?.timeout ? options.timeout + 5000 : undefined);
    options?.onStdout?.(r.stdout);
    options?.onStderr?.(r.stderr);
    return {
      success: r.exitCode === 0 && !r.timedOut,
      exitCode: r.exitCode,
      stdout: r.stdout,
      stderr: r.stderr,
      executionTimeMs: r.executionTimeMs,
      timedOut: r.timedOut,
      stdoutTruncated: r.stdoutTruncated,
      stderrTruncated: r.stderrTruncated,
      command,
      args,
    };
  }
}
