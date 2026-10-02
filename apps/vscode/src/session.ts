import * as vscode from "vscode";
import os from "node:os";
import { createAuraClient, pollDeviceSignIn, startDeviceSignIn, type AuraClient } from "@aura/client";
import { PROJECT_FILE, type ProjectConfig } from "./project-setup.js";

// The signed-in developer, their API client and this folder's AURA project. Shared by every view
// and command. The token is kept in VS Code's secret storage, never in settings or files.

const TOKEN_KEY = "aura.token";

export class Session {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  project: ProjectConfig | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {}

  get apiUrl(): string {
    return vscode.workspace.getConfiguration("aura").get<string>("apiUrl", "http://localhost:4000").replace(/\/+$/, "");
  }

  token(): Thenable<string | undefined> {
    return this.context.secrets.get(TOKEN_KEY);
  }

  client(): AuraClient {
    return createAuraClient({ baseUrl: this.apiUrl, token: async () => (await this.token()) ?? "" });
  }

  get folder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
  }

  async refresh(): Promise<void> {
    const signedIn = Boolean(await this.token());
    this.project = await this.readProject();
    await vscode.commands.executeCommand("setContext", "aura.signedIn", signedIn);
    await vscode.commands.executeCommand("setContext", "aura.projectConnected", Boolean(this.project));
    this.changed.fire();
  }

  private async readProject(): Promise<ProjectConfig | null> {
    if (!this.folder) return null;
    try {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.folder.uri, PROJECT_FILE));
      const parsed = JSON.parse(Buffer.from(raw).toString("utf8")) as Partial<ProjectConfig>;
      return parsed.projectId && parsed.projectKey && parsed.jiraProjectKey ? (parsed as ProjectConfig) : null;
    } catch {
      return null;
    }
  }

  // Stores a token only after the API confirms it belongs to a developer.
  async useToken(token: string): Promise<string> {
    await this.context.secrets.store(TOKEN_KEY, token);
    try {
      const me = await this.client().me();
      if (me.role !== "developer") throw new Error(`signed in as ${me.role}; AURA for VS Code is for developers`);
      await this.refresh();
      return me.fullName ?? me.email;
    } catch (error) {
      await this.context.secrets.delete(TOKEN_KEY);
      await this.refresh();
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await this.context.secrets.delete(TOKEN_KEY);
    await this.refresh();
  }

  // Device sign-in: show a code, open the browser, wait for the approval.
  async signInWithBrowser(): Promise<string | null> {
    const clientName = `VS Code on ${os.hostname()}`.slice(0, 80);
    const grant = await startDeviceSignIn(this.apiUrl, clientName);
    await vscode.env.clipboard.writeText(grant.userCode);
    void vscode.env.openExternal(vscode.Uri.parse(grant.verificationUriComplete));
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `AURA: approve code ${grant.userCode} in your browser (copied)`, cancellable: true },
      async (_progress, cancel) => {
        const deadline = Date.now() + grant.expiresIn * 1000;
        let interval = grant.interval * 1000;
        while (!cancel.isCancellationRequested && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, interval));
          const result = await pollDeviceSignIn(this.apiUrl, grant.deviceCode).catch(() => ({ status: "authorization_pending" as const }));
          if (result.status === "approved") return this.useToken(result.token);
          if (result.status === "slow_down") interval += 1000;
          if (result.status === "access_denied") throw new Error("the sign-in was denied in the browser");
          if (result.status === "expired_token") throw new Error("the code expired; run AURA: Sign In again");
        }
        return null;
      },
    );
  }
}
