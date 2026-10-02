import { promises as fs, realpathSync } from "node:fs";
import path from "node:path";
import { spawn as spawnChild, type ChildProcess } from "node:child_process";
import { MAX_OUTPUT_CHARS, MAX_TIMEOUT_MS, type BridgeArgs, type BridgeErrorCode, type BridgeOp, type BridgeResultValue, type FsEntry, type GrepFile, type ProcessInfo } from "@aura/bridge";

// Runs bridge operations inside one workspace folder (ADR-4). Every path is resolved against the
// folder and refused if it ends up outside it, including through a symlink. Commands run in the
// folder through the user's shell, with secrets removed from the environment and output capped.
// Plain Node: no VS Code API, so it is unit-tested directly.

export class ExecutorError extends Error {
  constructor(
    readonly code: BridgeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// Every operation's arguments in one shape; each case reads only the fields its op defines.
interface LooseArgs {
  path: string;
  src: string;
  dest: string;
  content: string;
  encoding?: "utf8" | "base64";
  overwrite?: boolean;
  force?: boolean;
  recursive?: boolean;
}

const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_GREP_FILE_BYTES = 1024 * 1024;
const MAX_GREP_FILES = 20_000;
const MAX_LINE_CHARS = 500;
// Output a background process keeps (the latest part); older output is dropped.
const MAX_PROCESS_OUTPUT_CHARS = 1024 * 1024;
const MAX_PROCESSES = 20;
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|jar|class|exe|dll|so|dylib|woff2?|ttf|eot|mp[34]|mov|lock)$/i;
const MAX_LIST_ENTRIES = 2000;
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", ".aura/worktrees"]);
const SECRET_ENV = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|CREDENTIAL|^AWS_|^GH_|^GITHUB_|^NPM_TOKEN|^AURA_)/i;

export function safeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !SECRET_ENV.test(k)));
}

function cap(text: string): { text: string; truncated: boolean } {
  return text.length > MAX_OUTPUT_CHARS ? { text: `${text.slice(0, MAX_OUTPUT_CHARS)}\n…(output truncated)`, truncated: true } : { text, truncated: false };
}

function notFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

// A background process's output: the latest MAX_PROCESS_OUTPUT_CHARS, with how much was dropped,
// so a reader asking "since offset N" gets exactly what it hasn't seen.
class OutputTail {
  text = "";
  dropped = 0;

  append(chunk: string): void {
    this.text += chunk;
    const excess = this.text.length - MAX_PROCESS_OUTPUT_CHARS;
    if (excess > 0) {
      this.text = this.text.slice(excess);
      this.dropped += excess;
    }
  }

  get total(): number {
    return this.dropped + this.text.length;
  }

  since(offset = 0): string {
    return this.text.slice(Math.max(0, offset - this.dropped));
  }
}

interface Background {
  pid: string;
  command: string;
  child: ChildProcess;
  stdout: OutputTail;
  stderr: OutputTail;
  exitCode?: number;
}

export class WorkspaceExecutor {
  private readonly root: string;
  private readonly processes = new Map<string, Background>();

  constructor(root: string) {
    this.root = realpathSync(path.resolve(root));
  }

  // Absolute path inside the workspace, or an outside_workspace error.
  resolve(relative: string): string {
    const target = path.resolve(this.root, relative || ".");
    if (!this.inside(target)) throw new ExecutorError("outside_workspace", `${relative} is outside the workspace folder`);
    // Follow symlinks for the nearest existing ancestor, so a link can't point the write elsewhere.
    let existing = target;
    while (existing !== this.root) {
      try {
        const real = realpathSync(existing);
        if (!this.inside(real)) throw new ExecutorError("outside_workspace", `${relative} leads outside the workspace folder`);
        break;
      } catch (error) {
        if (error instanceof ExecutorError) throw error;
        existing = path.dirname(existing);
      }
    }
    return target;
  }

  private inside(p: string): boolean {
    const rel = path.relative(this.root, p);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  }

  async run<O extends BridgeOp>(op: O, args: BridgeArgs<O>, signal?: AbortSignal): Promise<BridgeResultValue<O>> {
    try {
      return (await this.dispatch(op, args as unknown as LooseArgs, signal)) as BridgeResultValue<O>;
    } catch (error) {
      if (error instanceof ExecutorError) throw error;
      if (notFound(error)) throw new ExecutorError("not_found", (error as Error).message);
      if ((error as NodeJS.ErrnoException)?.code === "EEXIST") throw new ExecutorError("already_exists", (error as Error).message);
      throw new ExecutorError("failed", error instanceof Error ? error.message : String(error));
    }
  }

  private async dispatch(op: BridgeOp, a: LooseArgs, signal?: AbortSignal): Promise<unknown> {
    switch (op) {
      case "fs.readFile": {
        const file = this.resolve(a.path);
        const stat = await fs.stat(file);
        if (stat.size > MAX_READ_BYTES) throw new ExecutorError("failed", `${a.path} is larger than ${MAX_READ_BYTES / 1024 / 1024} MB`);
        const buffer = await fs.readFile(file);
        return a.encoding === "base64" ? { content: buffer.toString("base64"), encoding: "base64" } : { content: buffer.toString("utf8"), encoding: "utf8" };
      }
      case "fs.writeFile": {
        const file = this.resolve(a.path);
        if (a.overwrite === false && (await exists(file))) throw new ExecutorError("already_exists", `${a.path} already exists`);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, a.encoding === "base64" ? Buffer.from(a.content, "base64") : a.content);
        return null;
      }
      case "fs.appendFile":
        await fs.appendFile(this.resolve(a.path), a.content);
        return null;
      case "fs.deleteFile":
        await fs.rm(this.resolve(a.path), { force: Boolean(a.force) });
        return null;
      case "fs.copyFile":
        await fs.cp(this.resolve(a.src), this.resolve(a.dest), { force: a.overwrite !== false, errorOnExist: a.overwrite === false, recursive: true });
        return null;
      case "fs.moveFile": {
        const dest = this.resolve(a.dest);
        if (a.overwrite === false && (await exists(dest))) throw new ExecutorError("already_exists", `${a.dest} already exists`);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.rename(this.resolve(a.src), dest);
        return null;
      }
      case "fs.mkdir":
        await fs.mkdir(this.resolve(a.path), { recursive: a.recursive !== false });
        return null;
      case "fs.rmdir": {
        const dir = this.resolve(a.path);
        if (dir === this.root) throw new ExecutorError("denied", "The workspace folder itself can't be deleted");
        await fs.rm(dir, { recursive: Boolean(a.recursive), force: Boolean(a.force) });
        return null;
      }
      case "fs.readdir":
        return { entries: await this.list(this.resolve(a.path), Boolean(a.recursive)) };
      case "fs.exists":
        return { exists: await exists(this.resolve(a.path)) };
      case "fs.stat": {
        const file = this.resolve(a.path);
        const s = await fs.stat(file);
        return { name: path.basename(file), path: path.relative(this.root, file) || ".", type: s.isDirectory() ? "directory" : "file", size: s.size, createdAt: s.birthtime.toISOString(), modifiedAt: s.mtime.toISOString() };
      }
      case "fs.grep":
        return this.grep(a as unknown as BridgeArgs<"fs.grep">);
      case "sandbox.exec":
        return this.exec(a as unknown as BridgeArgs<"sandbox.exec">, signal);
      case "proc.spawn":
        return this.spawnBackground(a as unknown as BridgeArgs<"proc.spawn">);
      case "proc.read": {
        const r = a as unknown as BridgeArgs<"proc.read">;
        const p = this.background(r.pid);
        return { ...info(p), stdout: p.stdout.since(r.stdoutOffset), stderr: p.stderr.since(r.stderrOffset), stdoutOffset: p.stdout.total, stderrOffset: p.stderr.total };
      }
      case "proc.kill": {
        const p = this.background((a as unknown as BridgeArgs<"proc.kill">).pid);
        if (p.exitCode !== undefined) return { killed: false };
        killTree(p.child);
        return { killed: true };
      }
      case "proc.list":
        return { processes: [...this.processes.values()].map(info) };
    }
  }

  // Every background process this window started; called when VS Code closes the extension.
  killAll(): void {
    for (const p of this.processes.values()) if (p.exitCode === undefined) killTree(p.child);
  }

  private background(pid: string): Background {
    const p = this.processes.get(pid);
    if (!p) throw new ExecutorError("not_found", `No background process ${pid}`);
    return p;
  }

  private spawnBackground(a: BridgeArgs<"proc.spawn">): ProcessInfo {
    const running = [...this.processes.values()].filter((p) => p.exitCode === undefined).length;
    if (running >= MAX_PROCESSES) throw new ExecutorError("failed", `Already ${MAX_PROCESSES} background processes running; stop one first`);
    // Finished ones beyond the limit are forgotten, oldest first.
    for (const [pid, p] of this.processes) if (this.processes.size >= MAX_PROCESSES * 2 && p.exitCode !== undefined) this.processes.delete(pid);
    const cwd = this.resolve(a.cwd ?? ".");
    const child = spawnChild(a.command, { cwd, shell: true, env: safeEnv(process.env), stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    const pid = String(child.pid ?? `x${Date.now()}`);
    const p: Background = { pid, command: a.command, child, stdout: new OutputTail(), stderr: new OutputTail() };
    child.stdout?.on("data", (d: Buffer) => p.stdout.append(d.toString()));
    child.stderr?.on("data", (d: Buffer) => p.stderr.append(d.toString()));
    child.on("error", (error) => {
      p.stderr.append(`${error.message}\n`);
      p.exitCode ??= 127;
    });
    child.on("close", (code) => {
      p.exitCode = code ?? 1;
      clearTimeout(timer);
    });
    const timer = setTimeout(() => killTree(child), Math.min(Math.max(1000, a.timeoutMs ?? MAX_TIMEOUT_MS), MAX_TIMEOUT_MS));
    timer.unref?.();
    this.processes.set(pid, p);
    return info(p);
  }

  // Regex search over the workspace's text files: skips .git, node_modules and build output,
  // hidden files unless asked, binaries and files over 1 MB.
  private async grep(a: BridgeArgs<"fs.grep">): Promise<BridgeResultValue<"fs.grep">> {
    let regex: RegExp;
    try {
      regex = new RegExp(a.pattern, a.caseSensitive === false ? "i" : "");
    } catch (error) {
      throw new ExecutorError("invalid", `Invalid pattern: ${(error as Error).message}`);
    }
    const base = this.resolve(a.path);
    const maxTotal = Math.min(a.maxTotalMatches ?? 1000, 5000);
    const context = Math.max(0, Math.min(a.contextLines ?? 0, 10));
    const files: GrepFile[] = [];
    let total = 0;
    let scanned = 0;
    let truncated = false;

    const search = async (file: string) => {
      const stat = await fs.stat(file).catch(() => null);
      if (!stat || stat.size > MAX_GREP_FILE_BYTES || BINARY.test(file)) return;
      const text = await fs.readFile(file, "utf8").catch(() => null);
      if (text === null || text.includes("\u0000")) return;
      const lines = text.split(/\r?\n/);
      const matches: GrepFile["matches"] = [];
      for (let i = 0; i < lines.length; i++) {
        const m = regex.exec(lines[i]!);
        if (!m) continue;
        matches.push({
          line: i + 1,
          column: m.index,
          text: lines[i]!.slice(0, MAX_LINE_CHARS),
          ...(context ? { before: lines.slice(Math.max(0, i - context), i).map((l) => l.slice(0, MAX_LINE_CHARS)), after: lines.slice(i + 1, i + 1 + context).map((l) => l.slice(0, MAX_LINE_CHARS)) } : {}),
        });
        total++;
        if ((a.maxCountPerFile && matches.length >= a.maxCountPerFile) || total >= maxTotal) break;
      }
      if (matches.length) files.push({ path: path.relative(base, file).split(path.sep).join("/") || path.basename(file), matches });
    };

    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (total >= maxTotal || scanned >= MAX_GREP_FILES) return void (truncated = true);
        if (!a.includeHidden && entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name) && !SKIP_DIRS.has(path.relative(this.root, full))) await walk(full);
        } else if (entry.isFile()) {
          scanned++;
          await search(full);
        }
      }
    };

    const stat = await fs.stat(base);
    if (stat.isDirectory()) await walk(base);
    else await search(base);
    return { files, truncated: truncated || total >= maxTotal };
  }

  private async list(dir: string, recursive: boolean): Promise<FsEntry[]> {
    const out: FsEntry[] = [];
    const walk = async (current: string) => {
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        if (out.length >= MAX_LIST_ENTRIES) return;
        const full = path.join(current, entry.name);
        const rel = path.relative(dir, full);
        const isDir = entry.isDirectory();
        out.push({ name: recursive ? rel : entry.name, type: isDir ? "directory" : "file", ...(isDir ? {} : { size: (await fs.stat(full).catch(() => null))?.size }) });
        if (recursive && isDir && !SKIP_DIRS.has(entry.name) && !SKIP_DIRS.has(path.relative(this.root, full))) await walk(full);
      }
    };
    await walk(dir);
    return out;
  }

  private exec(a: BridgeArgs<"sandbox.exec">, signal?: AbortSignal): Promise<BridgeResultValue<"sandbox.exec">> {
    const cwd = this.resolve(a.cwd ?? ".");
    const timeout = Math.min(Math.max(1000, a.timeoutMs ?? 5 * 60_000), MAX_TIMEOUT_MS);
    const line = [a.command, ...(a.args ?? []).map(quote)].join(" ");
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const child = spawnChild(line, { cwd, shell: true, env: safeEnv(process.env), stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const kill = () => {
        try {
          if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
          else child.kill("SIGTERM");
        } catch {
          // already gone
        }
      };
      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, timeout);
      const onAbort = () => kill();
      signal?.addEventListener("abort", onAbort, { once: true });
      child.stdout.on("data", (d: Buffer) => {
        if (stdout.length <= MAX_OUTPUT_CHARS) stdout += d.toString();
      });
      child.stderr.on("data", (d: Buffer) => {
        if (stderr.length <= MAX_OUTPUT_CHARS) stderr += d.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new ExecutorError("failed", error.message));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (signal?.aborted) return reject(new ExecutorError("cancelled", "Cancelled"));
        const out = cap(stdout);
        const err = cap(stderr);
        resolve({ exitCode: code ?? (timedOut ? 124 : 1), stdout: out.text, stderr: err.text, executionTimeMs: Date.now() - started, timedOut, stdoutTruncated: out.truncated, stderrTruncated: err.truncated });
      });
    });
  }
}

function info(p: Background): ProcessInfo {
  return { pid: p.pid, command: p.command, running: p.exitCode === undefined, ...(p.exitCode !== undefined ? { exitCode: p.exitCode } : {}) };
}

function killTree(child: ChildProcess): void {
  try {
    if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    // already gone
  }
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(
    () => true,
    () => false,
  );
}

// Arguments passed separately are quoted for the shell; a full command line in `command` is not.
function quote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}
