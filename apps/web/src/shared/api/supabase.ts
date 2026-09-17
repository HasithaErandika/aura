import { createClient } from "@supabase/supabase-js";
import { env } from "../../config/env.ts";

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);
