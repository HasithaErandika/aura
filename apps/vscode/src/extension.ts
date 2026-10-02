import * as vscode from "vscode";
import { BridgeClient, type Approval, type BridgeState } from "./bridge-client.js";
import { ChatViewProvider, type ChatActivity } from "./chat/view.js";
import { WorkspaceExecutor } from "./executor.js";
import { PermissionPolicy } from "./permissions.js";
import { connectRepository, initializeProject } from "./project.js";
import { Session } from "./session.js";
import { TasksProvider, type TaskNode } from "./tasks-tree.js";

// AURA for VS Code (ADR-4, docs/plans/aura-vscode-agents.md). V1: browser sign-in, the Tasks view
// (Epic → Stories and Tasks), the chat panel with the VS Code agent, Stop / Resume / Open Run in
// Web, and Connect Repository / Initialize Project. Agents run in the AURA cloud; every file change and command they make runs
// here, inside the open folder, after your approval.

let bridge: BridgeClient | null = null;
let bridgeState: BridgeState = "disconnected";
const policy = new PermissionPolicy();

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("AURA");
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const session = new Session(context);
  context.subscriptions.push(output, status);

  const log = (line: string) => output.appendLine(`[${new Date().toLocaleTimeString()}] ${line}`);

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
    const choice = await vscode.window.showWarningMessage(question, { modal: true, detail }, "Allow once", "Allow for this session", "Deny");
    return choice === "Allow once" ? "once" : choice === "Allow for this session" ? "session" : "deny";
  };

  const connect = async (): Promise<boolean> => {
    const folder = session.folder;
    if (!folder) return void vscode.window.showErrorMessage("AURA: open a folder first. Agents work only inside it."), false;
    if (!vscode.workspace.isTrusted) return void vscode.window.showErrorMessage("AURA: trust this workspace first. Agents can run commands in it."), false;
    if (!(await session.token())) return void vscode.commands.executeCommand("aura.signIn"), false;
    if (bridge && bridgeState !== "disconnected") return true;
    bridge?.stop();
    policy.reset();
    bridge = new BridgeClient({
      apiUrl: session.apiUrl,
      token: () => Promise.resolve(session.token()),
      executor: new WorkspaceExecutor(folder.uri.fsPath),
      policy,
      workspaceName: folder.name,
      ask,
      log,
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
  void session.refresh().then(async () => {
    if (await session.token()) await connect();
  });
}

export function deactivate() {
  bridge?.stop();
}
