import { supabaseAdmin } from "../../lib/supabase.js";
import { decryptSecret, encryptSecret, maskSecret } from "../../lib/crypto.js";

export type CredentialProvider = "anthropic" | "openai";
export const CREDENTIAL_PROVIDERS: CredentialProvider[] = ["anthropic", "openai"];

export interface CredentialSummary {
  provider: CredentialProvider;
  connected: boolean;
  preview: string | null;
  updatedAt: string | null;
}

interface CredentialRow {
  provider: CredentialProvider;
  encrypted_key: string;
  updated_at: string;
}

// User-connected coding-agent API keys (Anthropic for Claude Code, OpenAI for Codex - see
// docs/ARCHITECTURE.md §6.5). Encrypted at rest before this module ever sees a row; the
// decrypted value only ever leaves here via getDecrypted(), used solely by the internal route
// apps/agent-runtime calls just-in-time (internal.router.ts) - never returned to the browser.
export const credentialsRepository = {
  async listForUser(userId: string): Promise<CredentialSummary[]> {
    const { data, error } = await supabaseAdmin.from("coding_agent_credentials").select("provider, encrypted_key, updated_at").eq("user_id", userId);
    if (error) throw new Error(`list credentials failed: ${error.message}`);
    const byProvider = new Map((data as CredentialRow[] | null)?.map((r) => [r.provider, r]) ?? []);
    return CREDENTIAL_PROVIDERS.map((provider) => {
      const row = byProvider.get(provider);
      if (!row) return { provider, connected: false, preview: null, updatedAt: null };
      return { provider, connected: true, preview: maskSecret(decryptSecret(row.encrypted_key)), updatedAt: row.updated_at };
    });
  },

  async upsert(userId: string, provider: CredentialProvider, apiKey: string): Promise<void> {
    const encrypted_key = encryptSecret(apiKey);
    const { error } = await supabaseAdmin
      .from("coding_agent_credentials")
      .upsert({ user_id: userId, provider, encrypted_key, updated_at: new Date().toISOString() }, { onConflict: "user_id,provider" });
    if (error) throw new Error(`save credential failed: ${error.message}`);
  },

  async remove(userId: string, provider: CredentialProvider): Promise<void> {
    const { error } = await supabaseAdmin.from("coding_agent_credentials").delete().eq("user_id", userId).eq("provider", provider);
    if (error) throw new Error(`remove credential failed: ${error.message}`);
  },

  // Internal use only (internal.router.ts) - the one place the plaintext key is read back.
  async getDecrypted(userId: string, provider: CredentialProvider): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from("coding_agent_credentials")
      .select("encrypted_key")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();
    if (error) throw new Error(`read credential failed: ${error.message}`);
    if (!data) return null;
    return decryptSecret((data as { encrypted_key: string }).encrypted_key);
  },
};
