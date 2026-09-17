import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Service-role client. Server-only, never expose this key to the browser.
// Used to verify user access tokens and to perform privileged admin.* calls
// (creating users, listing users) that the anon key cannot do.
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
