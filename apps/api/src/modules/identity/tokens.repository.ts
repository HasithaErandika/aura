import { dbError } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { TokenRow } from "./identity.types.js";

const COLUMNS = "id, user_id, name, prefix, created_at, last_used_at, expires_at, revoked_at";

export const tokensRepository = {
  async insert(input: { userId: string; name: string; tokenHash: string; prefix: string; expiresAt: string }): Promise<TokenRow> {
    const { data, error } = await supabaseAdmin
      .from("access_tokens")
      .insert({ user_id: input.userId, name: input.name, token_hash: input.tokenHash, prefix: input.prefix, expires_at: input.expiresAt, kind: "personal" })
      .select(COLUMNS)
      .single();
    if (error || !data) throw dbError("create access token", error ?? { message: "no row returned" });
    return data as TokenRow;
  },

  async listForUser(userId: string): Promise<TokenRow[]> {
    const { data, error } = await supabaseAdmin.from("access_tokens").select(COLUMNS).eq("user_id", userId).eq("kind", "personal").order("created_at", { ascending: false });
    if (error) throw dbError("list access tokens", error);
    return (data ?? []) as TokenRow[];
  },

  async revoke(userId: string, tokenId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from("access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId)
      .eq("user_id", userId)
      .is("revoked_at", null)
      .select("id");
    if (error) throw dbError("revoke access token", error);
    return (data ?? []).length > 0;
  },

  async findByHash(tokenHash: string): Promise<TokenRow | null> {
    const { data, error } = await supabaseAdmin.from("access_tokens").select(COLUMNS).eq("token_hash", tokenHash).maybeSingle();
    if (error) throw dbError("find access token", error);
    return (data as TokenRow | null) ?? null;
  },

  async touch(id: string, at: string): Promise<void> {
    const { error } = await supabaseAdmin.from("access_tokens").update({ last_used_at: at }).eq("id", id);
    if (error) throw dbError("record access token use", error);
  },
};
