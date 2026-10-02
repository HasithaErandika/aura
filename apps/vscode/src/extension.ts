import * as vscode from "vscode";
import { createAuraClient } from "@aura/client";
import { BridgeClient, type Approval, type BridgeState } from "./bridge-client.js";
import { WorkspaceExecutor } from "./executor.js";
import { PermissionPolicy } from "./permissions.js";

// AURA for VS Code, V0 (ADR-4, docs/plans/aura-vscode-agents.md §12): sign in with an access
// token, connect this window's folder to AURA, and ask the VS Code agent to work in it. The agent
// runs in the AURA cloud; every file and command it uses runs here, after your approval.

const TOKEN_KEY = "aura.token";
const AGENT_ID = "vscode-agent";
const THREAD_KEY = "aura.vscodeThread";

let bridge: BridgeClient | null = null;
let output: vscode.OutputChannel;
let status: vscode.StatusBarItem;
const policy = new PermissionPolicy();

function apiUrl(): string {
  return vscode.workspace.getConfiguration("aura").get<string>("apiUrl", "http://localhost:4000").replace(/\/+$/, "");
}

function log(line: string) {
  output.appendLine(`[${new Date().toLocaleTimeString()}] ${line}`);
}

function showState(state: BridgeState) {
  const text = { disconnected: "$(debug-disconnect) AURA", connecting: "$(sync~spin) AURA", connected: "$(plug) AURA" }[state];
  status.text = text;
  status.tooltip = { disconnected: "AURA: not connected. Click to connect.", connecting: "AURA: connecting…", connected: "AURA: connected. Agents can use this folder (with your approval)." }[state];
  status.command = state === "disconnected" ? "aura.connect" : "aura.disconnect";
}

async function ask(question: string, detail: string): Promise<Approval> {
  const choice = await vscode.window.showWarningMessage(question, { modal: true, detail }, "Allow once", "Allow for this session", "Deny");
  return choice === "Allow once" ? "once" : choice === "Allow for this session" ? "session" : "deny";
}

export function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel("AURA");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  showState("disconnected");
  status.show();
  context.subscriptions.push(output, status);

  const token = async () => context.secrets.get(TOKEN_KEY);
  const client = () => createAuraClient({ baseUrl: apiUrl(), token: async () => (await token()) ?? "" });

  const connect = async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return void vscode.window.showErrorMessage("AURA: open a folder first. Agents work only inside it.");
    if (!vscode.workspace.isTrusted) return void vscode.window.showErrorMessage("AURA: trust this workspace first. Agents can run commands in it.");
    bridge?.stop();
    policy.reset();
    bridge = new BridgeClient({
      apiUrl: apiUrl(),
      token,
      executor: new WorkspaceExecutor(folder.uri.fsPath),
      policy,
      workspaceName: folder.name,
      ask,
      log,
      onState: showState,
    });
    await bridge.start();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("aura.signIn", async () => {
      const value = await vscode.window.showInputBox({
        title: "AURA: Sign In",
        prompt: `Paste an access token from the AURA web app (Profile → Access tokens). API: ${apiUrl()}`,
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => (v.trim().startsWith("aura_pat_") ? null : "An AURA access token starts with aura_pat_"),
      });
      if (!value) return;
      await context.secrets.store(TOKEN_KEY, value.trim());
      try {
        const me = await client().me();
        if (me.role !== "developer") {
          await context.secrets.delete(TOKEN_KEY);
          return void vscode.window.showErrorMessage(`AURA: signed in as ${me.role}. The VS Code workspace is for developers.`);
        }
        vscode.window.showInformationMessage(`AURA: signed in as ${me.fullName ?? me.email}.`);
        await connect();
      } catch (error) {
        await context.secrets.delete(TOKEN_KEY);
        vscode.window.showErrorMessage(`AURA: sign-in failed. ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
    vscode.commands.registerCommand("aura.signOut", async () => {
      bridge?.stop();
      bridge = null;
      await context.secrets.delete(TOKEN_KEY);
      await context.workspaceState.update(THREAD_KEY, undefined);
      vscode.window.showInformationMessage("AURA: signed out.");
    }),
    vscode.commands.registerCommand("aura.connect", connect),
    vscode.commands.registerCommand("aura.disconnect", () => {
      bridge?.stop();
      bridge = null;
      log("Disconnected.");
    }),
    vscode.commands.registerCommand("aura.ask", async () => {
      if (!(await token())) return void vscode.commands.executeCommand("aura.signIn");
      if (!bridge) await connect();
      const message = await vscode.window.showInputBox({ title: "AURA: Ask the Agent", prompt: "What should the agent do in this workspace?", ignoreFocusOut: true });
      if (!message?.trim()) return;
      const api = client();
      output.show(true);
      log(`You: ${message}`);
      try {
        let threadId = context.workspaceState.get<string>(THREAD_KEY);
        if (!threadId) {
          threadId = (await api.threads.create(`VS Code: ${vscode.workspace.workspaceFolders?.[0]?.name ?? "workspace"}`, AGENT_ID)).id;
          await context.workspaceState.update(THREAD_KEY, threadId);
        }
        let line = "";
        for await (const e of api.threads.send(threadId, message, { agentId: AGENT_ID })) {
          if (e.event === "text") {
            line += e.data.delta;
            const parts = line.split("\n");
            line = parts.pop() ?? "";
            for (const p of parts) output.appendLine(p);
          } else if (e.event === "tool" && e.data.phase === "call") {
            if (line) (output.appendLine(line), (line = ""));
            log(`agent → ${e.data.toolName.replace(/^mastra_workspace_/, "")}`);
          } else if (e.event === "error") {
            log(`Error: ${e.data.message}`);
          } else if (e.event === "done") {
            if (line) output.appendLine(line);
            log(`Done (${e.data.status}).`);
          }
        }
      } catch (error) {
        log(`Error: ${error instanceof Error ? error.message : String(error)}`);
        vscode.window.showErrorMessage(`AURA: ${error instanceof Error ? error.message : String(error)}`);
      }
    }),
  );

  void token().then((t) => (t ? connect() : undefined));
}

export function deactivate() {
  bridge?.stop();
}
