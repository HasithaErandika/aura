import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../api/supabase.ts";
import { api } from "../api/client.ts";
import { describeError } from "../api/errors.ts";
import type { Me } from "../api/types.ts";
import { AuthContext } from "./auth-context.ts";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        if (!data.session) setLoading(false);
      })
      .catch(() => active && setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession((prev) => (prev?.access_token === next?.access_token ? prev : next));
      if (!next) {
        setProfile(null);
        setProfileError(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      setProfile(await api.get<Me>("/me"));
      setProfileError(null);
    } catch (error) {
      setProfile(null);
      setProfileError(describeError(error));
    }
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    void loadProfile().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ session, profile, loading, profileError, signIn, signOut, refreshProfile: loadProfile }),
    [session, profile, loading, profileError, signIn, signOut, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
