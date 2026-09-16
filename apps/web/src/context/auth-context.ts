import { createContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Role } from "../lib/roles.ts";

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  roleLabel: string;
}

export interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);
