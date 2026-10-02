import { spawn } from "node:child_process";
import { promises as fs, realpathSync } from "node:fs";
import path from "node:path";
import { MAX_OUTPUT_CHARS, MAX_TIMEOUT_MS, type BridgeArgs, type BridgeErrorCode, type BridgeOp, type BridgeResultValue, type FsEntry } from "@aura/bridge";

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

export class WorkspaceExecutor {
  private readonly root: string;

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
      case "sandbox.exec":
        return this.exec(a as unknown as BridgeArgs<"sandbox.exec">, signal);
    }
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
      const child = spawn(line, { cwd, shell: true, env: safeEnv(process.env), stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
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
