import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Me } from "../../types/api.ts";

export interface AuthState {
  session: Session | null;
  profile: Me | null;
  loading: boolean;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);
