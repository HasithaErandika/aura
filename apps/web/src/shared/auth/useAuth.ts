import { useContext } from "react";
import { AuthContext, type AuthState } from "./auth-context.ts";

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useProfile() {
  const { profile } = useAuth();
  if (!profile) throw new Error("useProfile must be used inside RequireAuth");
  return profile;
}
