import { access } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { devWorkspaceRoot, taskWorktreeDir } from '../workspace/dev-workspace';
import { decryptCliToken, verifyTicket, type TerminalTicket } from './ticket';
import { spawnPty, type PtySession } from './pty';
import { startRestrictedShell } from './restricted';

// The web terminal under the Scaffolded Project Files editor (docs/plans/aura-code-cli-council.md
// section 4.8): a WebSocket server, separate from Mastra's HTTP server, that opens a shell in one
// Task's worktree (or the discipline's base repo). The browser connects directly with a ticket
// apps/api minted after checking the Developer role and auditing the session (terminal/ticket.ts),
// so this server never decides who may connect - it only verifies the ticket.
//
// Modes (TERMINAL_MODE):
//   full        a real shell on a PTY (terminal/pty.ts) - default when bound to loopback, since
//               then only someone on this machine can reach it, who could open a shell anyway.
//   restricted  allowlisted commands only (terminal/restricted.ts) - default otherwise.
//   off         no terminal server at all.
// Disabled entirely when TERMINAL_TICKET_SECRET is unset.

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

// Open sessions, for the Runners view (server/runners-routes.ts). Observational only.
export interface TerminalSession {
  id: number;
  userId: string;
  label: string;
  mode: 'full' | 'restricted';
  startedAt: string;
}
const openSessions = new Map<number, TerminalSession>();
let sessionSeq = 0;

export function listTerminalSessions(): TerminalSession[] {
  return [...openSessions.values()];
}
const IDLE_TIMEOUT_MS = 30 * 60_000;
const MAX_SESSIONS_PER_USER = 3;

// The shell only gets what an interactive developer session needs - never AURA's own secrets
// (LLM keys, Jira token, ticket secret) from this process's environment.
const PASSTHROUGH_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'XDG_CONFIG_HOME', 'SSH_AUTH_SOCK', 'EDITOR', 'GIT_EDITOR', 'NVM_DIR', 'TZ'];

// AURA_TOKEN / AURA_API_URL sign the `aura` CLI in as the ticket's user (apps/cli config.ts
// requireConfig reads them first), so it works in the web terminal without `aura login`.
function shellEnv(ticket: TerminalTicket, secret: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { TERM: 'xterm-256color', COLORTERM: 'truecolor', AURA_TERMINAL: '1' };
  for (const key of PASSTHROUGH_ENV) if (process.env[key]) env[key] = process.env[key];
  const cliToken = ticket.cli ? decryptCliToken(ticket.cli.token, secret) : null;
  if (ticket.cli && cliToken) {
    env.AURA_API_URL = ticket.cli.apiUrl;
    env.AURA_TOKEN = cliToken;
  }
  return env;
}

function segment(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v && !v.includes('/') && !v.includes('\\') && v !== '.' && v !== '..' ? v : null;
}

async function resolveDir(ticket: TerminalTicket): Promise<string | null> {
  const epicKey = segment(ticket.epicKey)?.toUpperCase();
  const discipline = segment(ticket.discipline)?.toLowerCase();
  if (!epicKey || !discipline) return null;
  const base = path.resolve(devWorkspaceRoot, epicKey, 'dev', discipline);
  const taskKey = ticket.taskKey ? segment(ticket.taskKey)?.toUpperCase() : null;
  const dir = taskKey ? taskWorktreeDir(base, taskKey) : base;
  try {
    await access(dir);
    return dir;
  } catch {
    return null;
  }
}

function send(ws: WebSocket, data: string) {
  if (ws.readyState === ws.OPEN) ws.send(data);
}

export function startTerminalServer(): void {
  // Mastra's dev server re-evaluates index.ts on every reload; keep exactly one listener.
  const g = globalThis as { __auraTerminalServer?: WebSocketServer };
  if (g.__auraTerminalServer) return;

  const secret = process.env.TERMINAL_TICKET_SECRET ?? '';
  const host = process.env.TERMINAL_HOST || '127.0.0.1';
  const port = Number(process.env.TERMINAL_PORT || 4112);
  const loopback = LOOPBACK.has(host);
  const requested = process.env.TERMINAL_MODE;
  const mode = requested === 'off' || requested === 'restricted' || requested === 'full' ? requested : loopback ? 'full' : 'restricted';
  // A PTY needs POSIX; a full shell on a non-loopback bind is refused outright.
  const effectiveMode = mode === 'full' && (process.platform === 'win32' || !loopback) ? 'restricted' : mode;
  const allowedOrigins = (process.env.TERMINAL_ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean);

  if (effectiveMode === 'off') return;
  if (secret.length < 32) {
    console.warn('[aura-terminal] disabled: set TERMINAL_TICKET_SECRET (32+ characters, same value in apps/api) to enable the web terminal');
    return;
  }

  const sessionsByUser = new Map<string, number>();
  const wss = new WebSocketServer({
    host,
    port,
    maxPayload: 64 * 1024,
    // Blocks other websites from opening a terminal through a developer's browser.
    verifyClient: ({ origin }: { origin?: string }) => !origin || allowedOrigins.includes(origin),
  });
  g.__auraTerminalServer = wss;

  wss.on('error', (error: NodeJS.ErrnoException) => {
    console.warn(`[aura-terminal] ${error.code === 'EADDRINUSE' ? `port ${port} is already in use - terminal disabled` : error.message}`);
  });
  wss.on('listening', () => console.log(`[aura-terminal] ${effectiveMode} terminal on ws://${host}:${port}`));

  wss.on('connection', async (ws, req) => {
    const raw = new URL(req.url ?? '/', 'http://terminal').searchParams.get('ticket') ?? '';
    const ticket = verifyTicket(raw, secret);
    if (!ticket) return ws.close(4401, 'invalid or expired ticket');
    const open = sessionsByUser.get(ticket.userId) ?? 0;
    if (open >= MAX_SESSIONS_PER_USER) return ws.close(4429, `at most ${MAX_SESSIONS_PER_USER} terminals per user`);
    const dir = await resolveDir(ticket);
    if (!dir) return ws.close(4404, 'that directory does not exist yet');

    sessionsByUser.set(ticket.userId, open + 1);
    const label = ticket.taskKey ?? `${ticket.epicKey}/${ticket.discipline}`;
    const size = { rows: 24, cols: 100 };
    const session: PtySession =
      effectiveMode === 'full' ? spawnPty(process.env.SHELL || '/bin/bash', ['-l'], dir, shellEnv(ticket, secret), size) : startRestrictedShell(dir, label, shellEnv(ticket, secret));
    console.log(`[aura-terminal] open user=${ticket.userId} dir=${dir} mode=${effectiveMode}`);
    const sessionId = ++sessionSeq;
    openSessions.set(sessionId, { id: sessionId, userId: ticket.userId, label, mode: effectiveMode, startedAt: new Date().toISOString() });

    let idle: NodeJS.Timeout;
    const bump = () => {
      clearTimeout(idle);
      idle = setTimeout(() => ws.close(4408, 'idle timeout'), IDLE_TIMEOUT_MS);
    };
    bump();

    session.onData((chunk) => send(ws, chunk));
    session.onExit((code) => ws.close(1000, `exit ${code ?? ''}`.trim()));

    // Client frames: {"t":"i","d":"<keystrokes>"} or {"t":"r","rows":N,"cols":N}.
    ws.on('message', (data) => {
      bump();
      let msg: { t?: string; d?: unknown; rows?: unknown; cols?: unknown };
      try {
        msg = JSON.parse(data.toString()) as typeof msg;
      } catch {
        return;
      }
      if (msg.t === 'i' && typeof msg.d === 'string') session.write(msg.d);
      else if (msg.t === 'r' && typeof msg.rows === 'number' && typeof msg.cols === 'number') session.resize(Math.min(msg.rows, 500), Math.min(msg.cols, 500));
    });

    ws.on('close', () => {
      clearTimeout(idle);
      openSessions.delete(sessionId);
      session.kill();
      sessionsByUser.set(ticket.userId, Math.max(0, (sessionsByUser.get(ticket.userId) ?? 1) - 1));
      console.log(`[aura-terminal] close user=${ticket.userId} dir=${dir}`);
    });
  });
}
