import { createAuraClient } from "@aura/client";
import { DEFAULT_API_URL, configPath, deleteConfig, loadConfig, saveConfig } from "../config.js";
import { session } from "../context.js";
import { gitConfigValue } from "../git.js";
import { ask, c, json, out, warn } from "../ui.js";

export async function login(opts: { api?: string; token?: string; gitIdentity: boolean }): Promise<void> {
  if (process.env.AURA_TERMINAL && process.env.AURA_TOKEN) {
    out("You are already signed in - the AURA web terminal signs the CLI in as you automatically.");
    return;
  }
  const existing = await loadConfig();
  const apiUrl = (opts.api ?? existing?.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
  out(c.gray(`API: ${apiUrl}`));
  out(c.gray("Create a token on the AURA web app: Profile → Access tokens."));
  const token = opts.token ?? (await ask("Access token: ", { secret: true }));
  if (!token) throw new Error("No token given");
  if (!token.startsWith("aura_pat_")) warn("That does not look like an AURA access token (aura_pat_…); trying it anyway.");

  const client = createAuraClient({ baseUrl: apiUrl, token });
  const me = await client.me();
  await saveConfig({ apiUrl, token, tasks: existing?.apiUrl === apiUrl ? existing.tasks : {} });
  out(`${c.green("✓")} Logged in as ${c.bold(me.fullName ?? me.email)} (${me.roleLabel})`);
  out(c.gray(`  saved to ${configPath()}`));

  // Server-side commits AURA makes on your behalf (web Source Control, approved git steps) use
  // this identity; commits the CLI makes locally always use your git config directly.
  if (!opts.gitIdentity) return;
  const name = await gitConfigValue("user.name");
  const email = await gitConfigValue("user.email");
  if (!name || !email) {
    warn("git user.name / user.email are not set - AURA will commit as itself until you set them and run `aura login` again.");
    return;
  }
  if (me.gitIdentity.name !== name || me.gitIdentity.email !== email) {
    await client.setGitIdentity({ name, email });
    out(`${c.green("✓")} Git identity set to ${name} <${email}>`);
  }
}

export async function logout(): Promise<void> {
  await deleteConfig();
  out("Logged out. The token itself is still valid - revoke it on the Profile page if you no longer need it.");
}

export async function whoami(opts: { json?: boolean }): Promise<void> {
  const { client, config } = await session();
  const me = await client.me();
  if (opts.json) return json({ ...me, apiUrl: config.apiUrl });
  out(`${c.bold(me.fullName ?? me.email)} <${me.email}>`);
  out(`role     ${me.roleLabel}`);
  out(`git      ${me.gitIdentity.name ? `${me.gitIdentity.name} <${me.gitIdentity.email}>` : c.gray("not set")}`);
  out(`api      ${config.apiUrl}`);
}
