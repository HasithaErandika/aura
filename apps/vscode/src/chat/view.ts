import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { TurnEvent } from "@aura/client";
import type { Session } from "../session.js";
import type { Decision } from "@aura/client";
import { applyTaskEvent, type TaskBoard } from "../task-board.js";
import { addNote, addUserMessage, applyEvent, emptyChat, fromHistory, markDecided, markStopping, type ChatState } from "./model.js";

// The AURA chat panel: one conversation per Task (and one general one per folder) with the VS Code
// agent. Streams the turn live, shows each file and command the agent uses, and picks a running
// turn back up after VS Code reloads (turns run as background jobs in the cloud).

const AGENT_ID = "vscode-agent";
const CONVERSATIONS_KEY = "aura.conversations";
const CURRENT_KEY = "aura.currentConversation";
const BOARDS_KEY = "aura.taskBoards";

interface Conversation {
  key: string; // "general" or a Task key
  title: string;
  threadId: string | null;
}

type FromWebview =
  | { type: "send"; text: string }
  | { type: "ready" }
  | { type: "new" }
  | { type: "stop" }
  | { type: "decide"; approvalId: string; decision: Decision; reason?: string };

// What the status bar shows about the chat.
export interface ChatActivity {
  busy: boolean;
  stopping: boolean;
  runId: string | null;
  title: string;
}

const RESUME_MESSAGE = "Continue where you stopped.";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private state: ChatState = emptyChat();
  private conversation: Conversation;
  private following: AbortController | null = null;
  private readonly activity = new vscode.EventEmitter<ChatActivity>();
  readonly onDidChangeActivity = this.activity.event;
  private readonly taskChanged = new vscode.EventEmitter<TaskBoard | null>();
  // The Plan and Review views follow the Task of the current conversation.
  readonly onDidChangeTask = this.taskChanged.event;
  private lastTask: TaskBoard | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly session: Session,
    private readonly ensureConnected: () => Promise<boolean>,
    // Kills the run's tool calls on this machine at once (bridge-client.ts cancelRun).
    private readonly cancelLocal: (runId: string) => void,
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
      if (m.type === "stop") void this.stop();
      if (m.type === "decide") void this.decide(m.approvalId, m.decision, m.reason);
    });
  }

  // A Task event from outside the chat stream (the PR view's CI refresh).
  applyTaskEvent(data: Record<string, unknown>): void {
    const task = applyTaskEvent(this.state.task, data);
    if (task === this.state.task) return;
    this.state = { ...this.state, task };
    this.post();
  }

  get task(): TaskBoard | null {
    return this.state.task;
  }

  // A gate card's button (Gate 4 plan, Gate 5 review, Gate 6 pull request): records the decision
  // and follows the run as it continues.
  async decide(approvalId: string, decision: Decision, reason?: string): Promise<void> {
    if (this.state.busy) return;
    if ((decision === "revise" || decision === "reject") && !reason?.trim()) return void vscode.window.showWarningMessage("AURA: say what to change (or why you reject it) first.");
    try {
      this.state = markDecided(this.state, approvalId, decision);
      this.post();
      await this.follow(this.session.client().approvals.decide(approvalId, { decision, ...(reason?.trim() ? { reason: reason.trim() } : {}) }, this.abortable()));
    } catch (error) {
      this.state = markDecided(this.state, approvalId, "");
      this.notice(error);
    }
  }

  get current(): ChatActivity {
    return { busy: this.state.busy, stopping: this.state.stopping, runId: this.state.runId, title: this.conversation.title };
  }

  // Stop (plan §3): cancels the command running on this machine, then ends the turn in the cloud.
  // The conversation stays; Resume or any new message continues it.
  async stop(): Promise<void> {
    const runId = this.state.runId;
    if (!this.state.busy || this.state.stopping || !runId) return;
    this.state = markStopping(this.state);
    this.post();
    this.cancelLocal(runId);
    try {
      await this.session.client().runs.stop(runId);
    } catch (error) {
      this.state = { ...this.state, stopping: false };
      this.notice(error, true);
    }
  }

  // Resume: continues the current conversation after a Stop, a reload or an interrupted turn.
  async resume(): Promise<void> {
    if (this.state.busy) return void vscode.window.showInformationMessage("AURA: the agent is already working.");
    if (!this.conversation.threadId) return void vscode.window.showInformationMessage("AURA: nothing to resume. Start a Task or send a message.");
    await vscode.commands.executeCommand("aura.chat.focus");
    await this.send(RESUME_MESSAGE);
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
        "\nWork on it through AURA's gates: read the Task, its Epic's design documents and the relevant code, then propose the plan with delegate_to_planner.",
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
    this.state = emptyChat(conversation.title, this.boards()[conversation.key] ?? null);
    this.post();
    await this.load();
  }

  // History of the current conversation, then follow its turn if one is still running.
  private async load(): Promise<void> {
    if (!this.conversation.threadId || !(await this.session.token())) {
      this.state = { ...emptyChat(this.conversation.title, this.boards()[this.conversation.key] ?? null), busy: false };
      this.post();
      return;
    }
    try {
      const history = await this.session.client().threads.history(this.conversation.threadId, AGENT_ID);
      this.state = fromHistory(history.messages, this.conversation.title, history.latestRun?.id ?? null, this.boards()[this.conversation.key] ?? null);
      this.post();
      const run = history.latestRun;
      if (run && (run.status === "PENDING" || run.status === "RUNNING")) await this.follow(this.session.client().runs.follow(run.id, this.abortable()));
    } catch (error) {
      this.notice(error);
    }
  }

  private boards(): Record<string, TaskBoard> {
    return this.context.workspaceState.get<Record<string, TaskBoard>>(BOARDS_KEY) ?? {};
  }

  // Typing while the agent works (plan §3): a note the coders read at their next step.
  private async note(text: string): Promise<void> {
    const runId = this.state.runId;
    if (!runId) return;
    try {
      await this.session.client().runs.note(runId, text);
      this.state = addNote(this.state, text);
      this.post();
    } catch (error) {
      this.notice(error, true);
    }
  }

  private async send(text: string): Promise<void> {
    if (!text.trim()) return;
    if (this.state.busy) return void (this.state.stopping ? undefined : this.note(text.trim()));
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

  private notice(error: unknown, keepBusy = false): void {
    this.state = applyEvent({ ...this.state, busy: keepBusy && this.state.busy }, { event: "error", data: { message: error instanceof Error ? error.message : String(error) } });
    this.post();
  }

  private post(): void {
    void this.view?.webview.postMessage({ type: "state", state: this.state });
    this.activity.fire(this.current);
    if (this.state.task !== this.lastTask) {
      this.lastTask = this.state.task;
      if (this.state.task) void this.context.workspaceState.update(BOARDS_KEY, { ...this.boards(), [this.conversation.key]: this.state.task });
      this.taskChanged.fire(this.state.task);
    }
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
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  .note { align-self: flex-end; max-width: 90%; font-size: 12px; font-style: italic; color: var(--vscode-descriptionForeground); }
  .gate { border: 1px solid var(--vscode-focusBorder); border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
  .gate .gtitle { font-weight: 600; }
  .gate .row { display: flex; gap: 6px; }
  .gate .row button { padding: 4px 10px; }
  .gate textarea { min-height: 32px; }
  .gate .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
</style>
</head>
<body>
<div id="wrap">
  <header><span class="title" id="title">AURA</span><span class="busy" id="busy"></span></header>
  <div id="log"></div>
  <form id="form"><textarea id="input" rows="2" placeholder="Ask the agent… (Enter to send, Shift+Enter for a new line, Esc to stop)"></textarea><button id="send" type="submit">Send</button><button id="stop" type="button" class="secondary" hidden>Stop</button></form>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const log = document.getElementById('log');
  const input = document.getElementById('input');
  const send = document.getElementById('send');
  const icons = { running: '●', done: '✓', error: '✗' };
  let busy = false;
  const stopBtn = document.getElementById('stop');
  function stop() { vscode.postMessage({ type: 'stop' }); }
  stopBtn.addEventListener('click', stop);
  // A gate decision: Approve, Revise (with feedback) or Reject (with a reason).
  function gateCard(item, busy) {
    const box = el('div', 'gate');
    box.appendChild(el('div', 'gtitle', item.title));
    box.appendChild(el('div', '', item.question));
    if (item.decided) { box.appendChild(el('div', 'muted', 'Decided: ' + item.decided)); return box; }
    if (!item.canDecide) { box.appendChild(el('div', 'muted', 'Waiting for a decision by the approver.')); return box; }
    const feedback = el('textarea');
    feedback.placeholder = 'Feedback for Revise, or a reason for Reject';
    box.appendChild(feedback);
    const row = el('div', 'row');
    for (const [decision, label, cls] of [['approve', 'Approve', ''], ['revise', 'Revise', 'secondary'], ['reject', 'Reject', 'secondary']]) {
      const b = el('button', cls, label);
      b.type = 'button';
      b.disabled = busy;
      b.addEventListener('click', () => vscode.postMessage({ type: 'decide', approvalId: item.approvalId, decision, reason: feedback.value }));
      row.appendChild(b);
    }
    box.appendChild(row);
    return box;
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function render(state) {
    document.getElementById('title').textContent = state.title || 'AURA';
    busy = state.busy;
    document.getElementById('busy').textContent = state.stopping ? 'stopping…' : state.busy ? 'working…' : '';
    send.disabled = state.stopping;
    stopBtn.hidden = !state.busy;
    stopBtn.disabled = state.stopping;
    input.placeholder = state.busy ? 'Add a note for the agents (they read it at their next step)…' : 'Ask the agent… (Enter to send, Shift+Enter for a new line, Esc to stop)';
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.replaceChildren();
    if (!state.items.length) log.appendChild(el('div', 'empty', 'Pick a Task in the Tasks view, or ask the agent about this workspace.'));
    for (const item of state.items) {
      if (item.kind === 'user') log.appendChild(el('div', 'user', item.text));
      else if (item.kind === 'assistant') log.appendChild(el('div', 'assistant', item.text));
      else if (item.kind === 'notice') log.appendChild(el('div', 'notice' + (item.tone === 'error' ? ' error' : ''), item.text));
      else if (item.kind === 'note') log.appendChild(el('div', 'note', 'Note: ' + item.text));
      else if (item.kind === 'gate') log.appendChild(gateCard(item, state.busy));
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
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && busy) { e.preventDefault(); stop(); } });
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
