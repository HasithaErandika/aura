import type {
  CommandResult,
  CopyOptions,
  ExecuteCommandOptions,
  FileContent,
  FileEntry,
  FileStat,
  ListOptions,
  ReadOptions,
  RemoveOptions,
  WorkspaceFilesystem,
  WorkspaceSandbox,
  WriteOptions,
} from '@mastra/core/workspace';
import { DirectoryNotFoundError, FileExistsError, FileNotFoundError, PermissionError } from '@mastra/core/workspace';
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

  async stat(path: string): Promise<FileStat> {
    const s = await this.bridge.call('fs.stat', { path }).catch(mastraError(path, 'stat'));
    return { name: s.name, path: s.path, type: s.type, size: s.size, createdAt: new Date(s.createdAt), modifiedAt: new Date(s.modifiedAt) };
  }
}

export class BridgeSandbox implements WorkspaceSandbox {
  readonly id: string;
  readonly name = 'VS Code';
  readonly provider = 'aura-vscode';
  status = 'running' as const;

  constructor(
    private readonly bridge: BridgeCaller,
    runId: string,
  ) {
    this.id = `vscode-sandbox-${runId}`;
  }

  getInstructions(): string {
    return "Commands run in the developer's VS Code workspace folder on their own machine. Each command may wait for the developer's approval, and some are always refused (force pushes, deleting outside the folder, piping downloads into a shell). Prefer the project's own scripts (npm test, npm run lint).";
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
