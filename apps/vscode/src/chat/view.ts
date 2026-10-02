import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { TurnEvent } from "@aura/client";
import type { Session } from "../session.js";
import { addUserMessage, applyEvent, emptyChat, fromHistory, type ChatState } from "./model.js";

// The AURA chat panel: one conversation per Task (and one general one per folder) with the VS Code
// agent. Streams the turn live, shows each file and command the agent uses, and picks a running
// turn back up after VS Code reloads (turns run as background jobs in the cloud).

const AGENT_ID = "vscode-agent";
const CONVERSATIONS_KEY = "aura.conversations";
const CURRENT_KEY = "aura.currentConversation";

interface Conversation {
  key: string; // "general" or a Task key
  title: string;
  threadId: string | null;
}

type FromWebview = { type: "send"; text: string } | { type: "ready" } | { type: "new" };

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private state: ChatState = emptyChat();
  private conversation: Conversation;
  private following: AbortController | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly session: Session,
    private readonly ensureConnected: () => Promise<boolean>,
  ) {
    this.conversation = context.workspaceState.get<Conversation>(CURRENT_KEY) ?? { key: "general", title: "General", threadId: null };
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = html(randomBytes(16).toString("base64"));
    view.webview.onDidReceiveMessage((m: FromWebview) => {
      if (m.type === "ready") void this.load();
      if (m.type === "send") void this.send(m.text);
      if (m.type === "new") void this.newChat();
    });
  }

  // Opens (or continues) the conversation for a Task, and starts it with the Task's details.
  async startTask(task: { key: string; summary: string; epicKey: string }): Promise<void> {
    await vscode.commands.executeCommand("aura.chat.focus");
    const known = this.conversations()[task.key];
    await this.switchTo({ key: task.key, title: `${task.key} ${task.summary}`, threadId: known ?? null });
    if (known) return;
    let description = "";
    try {
      description = (await this.session.client().jira.issue(task.key)).description ?? "";
    } catch {
      // The agent can still work from the summary.
    }
    await this.send(
      [
        `Work on Jira Task ${task.key} (Epic ${task.epicKey}): ${task.summary}`,
        description ? `\nTask description:\n${description}` : "",
        "\nStart by reading the relevant code in this workspace, then propose a short plan before changing anything.",
      ].join("\n"),
    );
  }

  async newChat(): Promise<void> {
    await this.switchTo({ key: `general-${Date.now()}`, title: "General", threadId: null });
  }

  private conversations(): Record<string, string> {
    return this.context.workspaceState.get<Record<string, string>>(CONVERSATIONS_KEY) ?? {};
  }

  private async remember(conversation: Conversation): Promise<void> {
    this.conversation = conversation;
    await this.context.workspaceState.update(CURRENT_KEY, conversation);
    if (conversation.threadId) await this.context.workspaceState.update(CONVERSATIONS_KEY, { ...this.conversations(), [conversation.key]: conversation.threadId });
  }

  private async switchTo(conversation: Conversation): Promise<void> {
    this.following?.abort();
    await this.remember(conversation);
    this.state = emptyChat(conversation.title);
    this.post();
    await this.load();
  }

  // History of the current conversation, then follow its turn if one is still running.
  private async load(): Promise<void> {
    if (!this.conversation.threadId || !(await this.session.token())) {
      this.state = { ...emptyChat(this.conversation.title), busy: false };
      this.post();
      return;
    }
    try {
      const history = await this.session.client().threads.history(this.conversation.threadId, AGENT_ID);
      this.state = fromHistory(history.messages, this.conversation.title);
      this.post();
      const run = history.latestRun;
      if (run && (run.status === "PENDING" || run.status === "RUNNING")) await this.follow(this.session.client().runs.follow(run.id, this.abortable()));
    } catch (error) {
      this.notice(error);
    }
  }

  private async send(text: string): Promise<void> {
    if (!text.trim() || this.state.busy) return;
    if (!(await this.session.token())) return void vscode.commands.executeCommand("aura.signIn");
    if (!(await this.ensureConnected())) return;
    try {
      const api = this.session.client();
      if (!this.conversation.threadId) {
        const thread = await api.threads.create(this.conversation.title.slice(0, 120), AGENT_ID);
        await this.remember({ ...this.conversation, threadId: thread.id });
      }
      this.state = addUserMessage(this.state, text);
      this.post();
      await this.follow(api.threads.send(this.conversation.threadId!, text, { agentId: AGENT_ID, signal: this.abortable() }));
    } catch (error) {
      this.notice(error);
    }
  }

  private abortable(): AbortSignal {
    this.following?.abort();
    this.following = new AbortController();
    return this.following.signal;
  }

  private async follow(events: AsyncGenerator<TurnEvent>): Promise<void> {
    this.state = { ...this.state, busy: true };
    this.post();
    try {
      for await (const e of events) {
        this.state = applyEvent(this.state, e);
        this.post();
      }
    } catch (error) {
      if (!this.following?.signal.aborted) this.notice(error);
    } finally {
      this.state = { ...this.state, busy: false };
      this.post();
    }
  }

  private notice(error: unknown): void {
    this.state = applyEvent({ ...this.state, busy: false }, { event: "error", data: { message: error instanceof Error ? error.message : String(error) } });
    this.post();
  }

  private post(): void {
    void this.view?.webview.postMessage({ type: "state", state: this.state });
  }
}

// The panel itself. Everything from the agent is inserted as text (textContent), never as HTML.
function html(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style nonce="${nonce}">
  body { padding: 0; margin: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
  #wrap { display: flex; flex-direction: column; height: 100vh; }
  header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border); }
  header .title { flex: 1; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  header .busy { color: var(--vscode-descriptionForeground); font-size: 11px; }
  #log { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
  .user { align-self: flex-end; max-width: 90%; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 8px; padding: 6px 10px; white-space: pre-wrap; }
  .assistant { white-space: pre-wrap; line-height: 1.45; }
  .tool { font-family: var(--vscode-editor-font-family); font-size: 12px; color: var(--vscode-descriptionForeground); border-left: 2px solid var(--vscode-panel-border); padding-left: 8px; }
  .tool summary { cursor: pointer; list-style: none; }
  .tool .state-running { color: var(--vscode-charts-blue); }
  .tool .state-done { color: var(--vscode-testing-iconPassed); }
  .tool .state-error { color: var(--vscode-errorForeground); }
  .tool pre { white-space: pre-wrap; max-height: 240px; overflow: auto; margin: 4px 0 0; padding: 6px; background: var(--vscode-textCodeBlock-background); }
  .notice { font-size: 12px; padding: 6px 8px; border-radius: 4px; background: var(--vscode-inputValidation-infoBackground); }
  .notice.error { background: var(--vscode-inputValidation-errorBackground); }
  .empty { color: var(--vscode-descriptionForeground); text-align: center; margin-top: 24px; }
  form { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--vscode-panel-border); }
  textarea { flex: 1; resize: none; min-height: 38px; max-height: 160px; font-family: inherit; font-size: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; padding: 6px; }
  button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 4px; padding: 0 12px; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
</style>
</head>
<body>
<div id="wrap">
  <header><span class="title" id="title">AURA</span><span class="busy" id="busy"></span></header>
  <div id="log"></div>
  <form id="form"><textarea id="input" rows="2" placeholder="Ask the agent… (Enter to send, Shift+Enter for a new line)"></textarea><button id="send" type="submit">Send</button></form>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const log = document.getElementById('log');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const icons = { running: '●', done: '✓', error: '✗' };
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function render(state) {
    document.getElementById('title').textContent = state.title || 'AURA';
    document.getElementById('busy').textContent = state.busy ? 'working…' : '';
    send.disabled = state.busy;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.replaceChildren();
    if (!state.items.length) log.appendChild(el('div', 'empty', 'Pick a Task in the Tasks view, or ask the agent about this workspace.'));
    for (const item of state.items) {
      if (item.kind === 'user') log.appendChild(el('div', 'user', item.text));
      else if (item.kind === 'assistant') log.appendChild(el('div', 'assistant', item.text));
      else if (item.kind === 'notice') log.appendChild(el('div', 'notice' + (item.tone === 'error' ? ' error' : ''), item.text));
      else if (item.kind === 'tool') {
        const box = el('details', 'tool');
        const summary = el('summary');
        summary.appendChild(el('span', 'state-' + item.state, icons[item.state] + ' '));
        summary.appendChild(document.createTextNode(item.name + (item.detail ? '  ' + item.detail : '')));
        box.appendChild(summary);
        if (item.result) box.appendChild(el('pre', '', item.result));
        log.appendChild(box);
      }
    }
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  window.addEventListener('message', (e) => { if (e.data && e.data.type === 'state') render(e.data.state); });
  document.getElementById('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || send.disabled) return;
    vscode.postMessage({ type: 'send', text });
    input.value = '';
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('form').requestSubmit(); } });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
