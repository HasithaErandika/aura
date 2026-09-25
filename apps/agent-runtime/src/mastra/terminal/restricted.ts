import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { PtySession } from './pty';

// TERMINAL_MODE=restricted: no real shell. A minimal line editor runs one allowlisted command at
// a time with execFile-style argv (no shell, so `|`, `;`, `$(...)` are just literal characters),
// cwd fixed to the Task directory, and any path argument checked to stay inside it. Used when the
// runtime is reachable from anything but this machine (docs/plans/aura-code-cli-council.md D7).

const ALLOWED: Record<string, (args: string[]) => string | null> = {
  aura: () => null,
  git: (args) => (['status', 'diff', 'log', 'show', 'branch', 'add', 'commit', 'restore', 'stash', 'blame'].includes(args[0] ?? '') ? null : 'git: allowed subcommands are status, diff, log, show, branch, add, commit, restore, stash, blame'),
  npm: (args) => (args[0] === 'test' || args[0] === 'run' || args[0] === 'ls' ? null : 'npm: allowed subcommands are test, run <script>, ls'),
  ls: () => null,
  cat: () => null,
  pwd: () => null,
};

// Splits a command line into argv, honouring single/double quotes and backslash escapes.
function splitArgs(line: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && i + 1 < line.length) current += line[++i];
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (ch === '\\' && i + 1 < line.length) {
      current += line[++i];
      has = true;
    } else if (/\s/.test(ch)) {
      if (has || current) args.push(current);
      current = '';
      has = false;
    } else {
      current += ch;
      has = true;
    }
  }
  if (has || current) args.push(current);
  return args;
}

function escapesRoot(root: string, arg: string): boolean {
  if (arg.startsWith('-')) return false;
  const resolved = path.resolve(root, arg);
  return resolved !== root && !resolved.startsWith(root + path.sep);
}

const crlf = (text: string) => text.replace(/\r?\n/g, '\r\n');

export function startRestrictedShell(root: string, label: string, env: NodeJS.ProcessEnv): PtySession {
  const dataListeners: ((chunk: string) => void)[] = [];
  const exitListeners: ((code: number | null) => void)[] = [];
  const emit = (text: string) => dataListeners.forEach((l) => l(text));
  const prompt = () => emit(`\x1b[32m${label}\x1b[0m \x1b[90m(restricted)\x1b[0m $ `);
  let line = '';
  let running: ChildProcess | null = null;
  let inEscape = false;

  const help = () =>
    emit(crlf(`Restricted terminal - no shell. Allowed: ${Object.keys(ALLOWED).join(', ')}, clear, help, exit.\nFor a full shell, run AURA on your own machine (TERMINAL_MODE=full) or use the aura CLI locally.\n`));

  const run = (commandLine: string) => {
    const argv = splitArgs(commandLine.trim());
    const [program, ...args] = argv;
    if (!program) return prompt();
    if (program === 'help') return help(), prompt();
    if (program === 'clear') return emit('\x1b[2J\x1b[H'), prompt();
    if (program === 'exit') return exitListeners.forEach((l) => l(0));
    const check = ALLOWED[program];
    if (!check) return emit(crlf(`${program}: not allowed here (type "help")\n`)), prompt();
    const refusal = check(args) ?? (args.some((a) => escapesRoot(root, a)) ? `${program}: paths must stay inside this Task's directory` : null);
    if (refusal) return emit(crlf(`${refusal}\n`)), prompt();

    running = spawn(program, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    running.stdout!.setEncoding('utf8');
    running.stderr!.setEncoding('utf8');
    running.stdout!.on('data', (d: string) => emit(crlf(d)));
    running.stderr!.on('data', (d: string) => emit(crlf(d)));
    running.on('error', (e) => emit(crlf(`${program}: ${e.message}\n`)));
    running.on('close', (code) => {
      running = null;
      if (code) emit(`\x1b[90m[exit ${code}]\x1b[0m\r\n`);
      prompt();
    });
  };

  setTimeout(() => {
    help();
    prompt();
  }, 0);

  return {
    write: (data) => {
      for (const ch of data) {
        if (inEscape) {
          // Swallow arrow keys and other CSI sequences - no history/cursor movement here.
          if (/[A-Za-z~]/.test(ch)) inEscape = false;
          continue;
        }
        if (ch === '\x1b') {
          inEscape = true;
          continue;
        }
        if (ch === '\x03') {
          if (running) running.kill('SIGINT');
          else {
            line = '';
            emit('^C\r\n');
            prompt();
          }
          continue;
        }
        if (running) continue;
        if (ch === '\r' || ch === '\n') {
          emit('\r\n');
          const current = line;
          line = '';
          run(current);
        } else if (ch === '\x7f' || ch === '\b') {
          if (line) {
            line = line.slice(0, -1);
            emit('\b \b');
          }
        } else if (ch >= ' ') {
          line += ch;
          emit(ch);
        }
      }
    },
    resize: () => undefined,
    kill: () => {
      running?.kill('SIGKILL');
      exitListeners.forEach((l) => l(null));
    },
    onData: (listener) => void dataListeners.push(listener),
    onExit: (listener) => void exitListeners.push(listener),
  };
}
