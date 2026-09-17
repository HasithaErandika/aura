import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../api/supabase.ts";
import { api } from "../api/client.ts";
import { describeError } from "../api/errors.ts";
import type { Me } from "../../types/api.ts";
import { AuthContext } from "./auth-context.ts";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession((prev) => (prev?.access_token === nextSession?.access_token ? prev : nextSession));
      if (!nextSession) {
        setProfile(null);
        setProfileError(null);
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const me = await api.get<Me>("/me");
      setProfile(me);
      setProfileError(null);
    } catch (error) {
      setProfile(null);
      setProfileError(describeError(error));
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    loadProfile().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, profileError, signIn, signOut, refreshProfile: loadProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
