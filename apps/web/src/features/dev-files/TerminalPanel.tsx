import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { describeError } from "../../shared/api/errors.ts";
import { vscode } from "../../shared/lib/vscodeTheme.ts";
import { terminalApi, type ScaffoldDiscipline } from "./api.ts";

// VS Code-style integrated terminal under the file editor: a shell (or, when AURA is not bound
// to localhost, a restricted command runner) opened in the loaded Task's worktree. The shell runs
// in apps/agent-runtime (terminal/server.ts); apps/api only mints the ticket after checking the
// Developer role and auditing the session. `aura`, `git`, `npm test` etc. all work here exactly
// as in a local terminal.

type Status = "connecting" | "open" | "closed" | "error";

const THEME = {
  background: vscode.editorBg,
  foreground: vscode.text,
  cursor: "#aeafad",
  selectionBackground: "#264f78",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#e5e510",
  blue: "#2472c8",
  magenta: "#bc3fbc",
  cyan: "#11a8cd",
  white: "#e5e5e5",
  brightBlack: "#666666",
  brightRed: "#f14c4c",
  brightGreen: "#23d18b",
  brightYellow: "#f5f543",
  brightBlue: "#3b8eea",
  brightMagenta: "#d670d6",
  brightCyan: "#29b8db",
  brightWhite: "#e5e5e5",
};

// Close codes sent by the terminal server, as human-readable reasons.
const CLOSE_REASONS: Record<number, string> = {
  4401: "The terminal ticket was rejected or expired.",
  4404: "This directory does not exist yet - has the Task been scaffolded?",
  4408: "Closed after 30 minutes without input.",
  4429: "Too many terminals open - close one first.",
};

export function TerminalPanel({ epicKey, discipline, taskKey, onCommandFinished, tabs }: { epicKey: string; discipline: ScaffoldDiscipline; taskKey?: string; onCommandFinished?: () => void; tabs?: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [message, setMessage] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const refreshTimer = useRef<number | undefined>(undefined);
  const onCommandFinishedRef = useRef(onCommandFinished);

  useEffect(() => {
    onCommandFinishedRef.current = onCommandFinished;
  });

  // One xterm instance per mounted panel.
  useEffect(() => {
    const term = new Terminal({ fontFamily: "Menlo, Monaco, 'Cascadia Code', 'Courier New', monospace", fontSize: 13, cursorBlink: true, theme: THEME, scrollback: 5000, allowProposedApi: false });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current!);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // Hidden or zero-sized while collapsing; the next resize fixes it.
      }
    });
    observer.observe(hostRef.current!);
    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // (Re)connects whenever the directory or the session counter changes.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    let disposed = false;
    const disposables: { dispose(): void }[] = [];
    setStatus("connecting");
    setMessage(null);
    term.reset();

    (async () => {
      let ws: WebSocket;
      try {
        const { url, ticket } = await terminalApi.ticket(epicKey, discipline, taskKey);
        if (disposed) return;
        ws = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`);
      } catch (e) {
        if (!disposed) {
          setStatus("error");
          setMessage(describeError(e));
        }
        return;
      }
      socketRef.current = ws;
      const sendSize = () => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: "r", rows: term.rows, cols: term.cols }));

      ws.onopen = () => {
        setStatus("open");
        sendSize();
        term.focus();
      };
      ws.onmessage = (event) => {
        const text = typeof event.data === "string" ? event.data : "";
        term.write(text);
        // A new prompt usually means a command just finished - refresh the file tree shortly
        // after, debounced, so edits made from the terminal show up in the Explorer.
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(() => onCommandFinishedRef.current?.(), 1200);
      };
      ws.onclose = (event) => {
        if (disposed) return;
        setStatus("closed");
        setMessage(CLOSE_REASONS[event.code] ?? (event.reason ? `Session ended (${event.reason}).` : "Disconnected from the terminal server - is agent-runtime running with TERMINAL_TICKET_SECRET set?"));
      };
      disposables.push(term.onData((data) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: "i", d: data }))));
      disposables.push(term.onResize(() => sendSize()));
    })();

    return () => {
      disposed = true;
      disposables.forEach((d) => d.dispose());
      socketRef.current?.close();
      socketRef.current = null;
      window.clearTimeout(refreshTimer.current);
    };
  }, [epicKey, discipline, taskKey, session]);

  const restart = useCallback(() => setSession((n) => n + 1), []);
  const kill = useCallback(() => socketRef.current?.close(), []);

  const dot = status === "open" ? "#23d18b" : status === "connecting" ? "#e5e510" : "#f14c4c";

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ backgroundColor: vscode.editorBg, borderTop: `1px solid ${vscode.border}` }}>
      <div className="flex shrink-0 items-center gap-3 px-3 py-1.5" style={{ backgroundColor: vscode.tabBarBg, borderBottom: `1px solid ${vscode.border}` }}>
        {tabs ?? (
          <span className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: vscode.text, borderBottom: `1px solid ${vscode.accent}` }}>
            Terminal
          </span>
        )}
        <span className="flex items-center gap-1.5 font-mono text-[11px]" style={{ color: vscode.mutedText }}>
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: dot }} />
          {taskKey ?? `${epicKey}/${discipline.toLowerCase()}`}
        </span>
        {message ? (
          <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: status === "error" ? "#f14c4c" : vscode.mutedText }}>
            {message}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <button type="button" onClick={restart} className="rounded px-2 py-0.5 text-[11px] hover:bg-white/10" style={{ color: vscode.text }} title="Start a new terminal session">
          {status === "open" || status === "connecting" ? "Restart" : "Reconnect"}
        </button>
        <button type="button" onClick={kill} disabled={status !== "open"} className="rounded px-2 py-0.5 text-[11px] hover:bg-white/10 disabled:opacity-40" style={{ color: vscode.text }} title="End this terminal session">
          Kill
        </button>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 px-2 pt-1" />
    </div>
  );
}
