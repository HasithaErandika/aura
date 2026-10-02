import * as vscode from "vscode";
import { BridgeClient, type Approval, type BridgeState } from "./bridge-client.js";
import { GIT_SCHEME, GitShowProvider, PlanView, PullRequestView, ReviewView, openDiff } from "./task-views.js";
import { prEventFrom, type TaskBoard } from "./task-board.js";
import { ChatViewProvider, type ChatActivity } from "./chat/view.js";
import { WorkspaceExecutor } from "./executor.js";
import { Governance } from "./governance.js";
import { MODE_LABELS, PermissionPolicy } from "./permissions.js";
import { connectRepository, initializeProject } from "./project.js";
import { Session } from "./session.js";
import { TasksProvider, type TaskNode } from "./tasks-tree.js";

// AURA for VS Code (ADR-4, docs/plans/aura-vscode-agents.md). V1: browser sign-in, the Tasks view
// (Epic → Stories and Tasks), the chat panel with the VS Code agent, Stop / Resume / Open Run in
// Web, and Connect Repository / Initialize Project. V2: permission modes, project rules and hooks
// (.aura/settings.json), background processes. Agents run in the AURA cloud; every file change
// and command they make runs here, inside the open folder, under those rules.

let bridge: BridgeClient | null = null;
let executor: WorkspaceExecutor | null = null;
let bridgeState: BridgeState = "disconnected";
const policy = new PermissionPolicy();

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("AURA");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const modeStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  const session = new Session(context);
  context.subscriptions.push(output, status, modeStatus);

  const log = (line: string) => output.appendLine(`[${new Date().toLocaleTimeString()}] ${line}`);
  const governance = new Governance(context, session, policy, log);
  const showMode = () => {
    modeStatus.text = { plan: "$(eye) Plan", default: "$(shield) Ask", acceptEdits: "$(edit) Accept edits" }[governance.mode];
    modeStatus.tooltip = `AURA permission mode: ${MODE_LABELS[governance.mode]}. Click to change.`;
    modeStatus.command = "aura.setMode";
    modeStatus.show();
  };
  context.subscriptions.push(governance.onDidChange(showMode), governance.watch());

  let activity: ChatActivity = { busy: false, stopping: false, runId: null, title: "" };
  const showStatus = () => {
    const project = session.project ? ` ${session.project.projectKey}` : "";
    if (activity.busy && bridgeState === "connected") {
      status.text = `$(loading~spin) AURA${project} · ${activity.stopping ? "stopping" : activity.title}`.slice(0, 80);
      status.tooltip = `AURA: the agent is working on ${activity.title}. Click to stop.`;
      status.command = "aura.stop";
      return status.show();
    }
    status.text = { disconnected: `$(debug-disconnect) AURA${project}`, connecting: `$(sync~spin) AURA${project}`, connected: `$(plug) AURA${project}` }[bridgeState];
    status.tooltip = {
      disconnected: "AURA: agents can't reach this folder. Click to connect.",
      connecting: "AURA: connecting…",
      connected: "AURA: connected. Agents can use this folder; every change asks you first.",
    }[bridgeState];
    status.command = bridgeState === "disconnected" ? "aura.connect" : "aura.disconnect";
    status.show();
  };

  const ask = async (question: string, detail: string): Promise<Approval> => {
    const choice = await vscode.window.showWarningMessage(question, { modal: true, detail }, "Allow once", "Allow for this session", "Allow for this project", "Deny");
    return choice === "Allow once" ? "once" : choice === "Allow for this session" ? "session" : choice === "Allow for this project" ? "project" : "deny";
  };

  const connect = async (): Promise<boolean> => {
    const folder = session.folder;
    if (!folder) return void vscode.window.showErrorMessage("AURA: open a folder first. Agents work only inside it."), false;
    if (!vscode.workspace.isTrusted) return void vscode.window.showErrorMessage("AURA: trust this workspace first. Agents can run commands in it."), false;
    if (!(await session.token())) return void vscode.commands.executeCommand("aura.signIn"), false;
    if (bridge && bridgeState !== "disconnected") return true;
    bridge?.stop();
    policy.reset();
    await governance.reload();
    executor ??= new WorkspaceExecutor(folder.uri.fsPath);
    bridge = new BridgeClient({
      apiUrl: session.apiUrl,
      token: () => Promise.resolve(session.token()),
      executor,
      policy,
      workspaceName: folder.name,
      ask,
      log,
      hooks: () => governance.hooks,
      allowForProject: (rule) => governance.allowForProject(rule),
      onState: (state) => {
        bridgeState = state;
        showStatus();
      },
    });
    await bridge.start();
    for (let i = 0; i < 40 && bridgeState === "connecting"; i++) await new Promise((r) => setTimeout(r, 100));
    if (bridgeState !== "connected") void vscode.window.showWarningMessage("AURA: couldn't connect this folder yet. See the AURA output for details.");
    return bridgeState === "connected";
  };

  const disconnect = () => {
    bridge?.stop();
    bridge = null;
    bridgeState = "disconnected";
    showStatus();
  };

  const tasks = new TasksProvider(session);
  const chat = new ChatViewProvider(context, session, connect, (runId) => {
    const killed = bridge?.cancelRun(runId) ?? 0;
    log(`■ Stopped by you${killed ? ` (cancelled ${killed} running call${killed === 1 ? "" : "s"})` : ""}.`);
  });
  const planView = new PlanView();
  const reviewView = new ReviewView();
  const prView = new PullRequestView();
  // CI status for the PR view: from AURA's API, which aura-ci.yml reports to.
  const refreshPr = async (quiet = false) => {
    const taskKey = chat.task?.pr?.url ? chat.task.taskKey : null;
    if (!taskKey) return;
    try {
      const [pr] = await session.client().taskPrs.list({ taskKey });
      if (pr) chat.applyTaskEvent(prEventFrom(pr));
    } catch (error) {
      if (!quiet) void vscode.window.showWarningMessage(`AURA: couldn't read the pull request's CI status (${error instanceof Error ? error.message : String(error)}).`);
    }
  };
  const ciPoll = setInterval(() => {
    const state = chat.task?.pr?.ciState;
    if (chat.task?.pr?.url && (state === "pending" || state === "running" || state === null)) void refreshPr(true);
  }, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(ciPoll) });
  const syncTask = (board: TaskBoard | null) => {
    planView.update(board);
    reviewView.update(board);
    prView.update(board);
    void vscode.commands.executeCommand("setContext", "aura.hasPr", Boolean(board?.pr));
    void vscode.commands.executeCommand("setContext", "aura.hasPlan", Boolean(board?.plan));
    void vscode.commands.executeCommand("setContext", "aura.hasReview", Boolean(board?.review));
  };
  syncTask(chat.task);
  const workspaceRoot = () => vscode.workspace.workspaceFolders?.[0]?.uri ?? null;
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("aura.plan", planView),
    vscode.window.registerTreeDataProvider("aura.review", reviewView),
    vscode.window.registerTreeDataProvider("aura.pr", prView),
    vscode.commands.registerCommand("aura.refreshPr", () => refreshPr()),
    chat.onDidChangeTask(syncTask),
    vscode.workspace.registerTextDocumentContentProvider(GIT_SCHEME, new GitShowProvider(() => workspaceRoot()?.fsPath ?? null)),
    vscode.commands.registerCommand("aura.openDiff", async (path: string, status: string, baseRef?: string) => {
      const root = workspaceRoot();
      if (root && typeof path === "string") await openDiff(root, path, status, baseRef);
    }),
  );
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("aura.tasks", tasks),
    vscode.window.registerWebviewViewProvider("aura.chat", chat, { webviewOptions: { retainContextWhenHidden: true } }),
    session.onDidChange(showStatus),
    chat.onDidChangeActivity((next) => {
      activity = next;
      void vscode.commands.executeCommand("setContext", "aura.running", next.busy);
      showStatus();
    }),
  );

  const report = (error: unknown) => void vscode.window.showErrorMessage(`AURA: ${error instanceof Error ? error.message : String(error)}`);

  context.subscriptions.push(
    vscode.commands.registerCommand("aura.signIn", async () => {
      try {
        const who = await session.signInWithBrowser();
        if (who) {
          void vscode.window.showInformationMessage(`AURA: signed in as ${who}.`);
          await connect();
        }
      } catch (error) {
        report(error);
      }
    }),
    vscode.commands.registerCommand("aura.signInWithToken", async () => {
      const value = await vscode.window.showInputBox({
        title: "AURA: Sign In with a Token",
        prompt: `Paste an access token from the AURA web app (Profile → Access tokens). API: ${session.apiUrl}`,
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim().startsWith("aura_pat_") ? null : "An AURA access token starts with aura_pat_"),
      });
      if (!value) return;
      try {
        void vscode.window.showInformationMessage(`AURA: signed in as ${await session.useToken(value.trim())}.`);
        await connect();
      } catch (error) {
        report(error);
      }
    }),
    vscode.commands.registerCommand("aura.signOut", async () => {
      disconnect();
      await session.signOut();
      void vscode.window.showInformationMessage("AURA: signed out.");
    }),
    vscode.commands.registerCommand("aura.connect", connect),
    vscode.commands.registerCommand("aura.disconnect", disconnect),
    vscode.commands.registerCommand("aura.refreshTasks", () => tasks.refresh()),
    vscode.commands.registerCommand("aura.newChat", () => chat.newChat()),
    vscode.commands.registerCommand("aura.stop", () => chat.stop()),
    vscode.commands.registerCommand("aura.setMode", () => governance.pickMode()),
    vscode.commands.registerCommand("aura.stopBackgroundProcesses", () => {
      executor?.killAll();
      log("■ Stopped every background process this window started.");
    }),
    vscode.commands.registerCommand("aura.resume", () => chat.resume()),
    vscode.commands.registerCommand("aura.openRunInWeb", () => {
      const runId = chat.current.runId;
      if (!runId) return void vscode.window.showInformationMessage("AURA: this conversation has no run yet.");
      void vscode.env.openExternal(vscode.Uri.parse(`${session.webUrl}/app/runs/${encodeURIComponent(runId)}`));
    }),
    vscode.commands.registerCommand("aura.startTask", async (node?: TaskNode) => {
      if (node?.kind !== "issue") return;
      await chat.startTask({ key: node.issue.key, summary: node.issue.summary, epicKey: node.epicKey });
    }),
    vscode.commands.registerCommand("aura.openInJira", (node?: TaskNode) => {
      const url = node && (node.kind === "issue" || node.kind === "epic") ? node.issue.url : null;
      if (url) void vscode.env.openExternal(vscode.Uri.parse(url));
    }),
    vscode.commands.registerCommand("aura.connectRepository", () => connectRepository(session).catch(report)),
    vscode.commands.registerCommand("aura.initializeProject", () => initializeProject(session).catch(report)),
  );

  showStatus();
  showMode();
  void session.refresh().then(async () => {
    await governance.reload();
    if (await session.token()) await connect();
  });
}

export function deactivate() {
  bridge?.stop();
  executor?.killAll();
}
