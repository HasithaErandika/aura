import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import type { Me } from "../api/types.ts";
import type { Role } from "../lib/roles.ts";
import { Button } from "../ui/Button.tsx";
import { Spinner } from "../ui/Spinner.tsx";
import { useAuth } from "./useAuth.ts";

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">{children}</div>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, profile, profileError, refreshProfile, signOut } = useAuth();
  const location = useLocation();

  if (loading || (session && !profile && !profileError)) {
    return (
      <FullScreen>
        <Spinner label="Loading your workspace" />
      </FullScreen>
    );
  }
  if (!session) return <Navigate to={paths.login} replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (!profile) {
    return (
      <FullScreen>
        <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 text-sm text-ink-700 shadow-sm" role="alert">
          <p className="font-semibold text-ink-900">Your profile could not be loaded</p>
          <p className="mt-2">{profileError ?? "The API did not return a profile for this account."}</p>
          <p className="mt-2 text-ink-500">Check that the API is running and that an administrator has provisioned your account.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void refreshProfile()}>
              Try again
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </FullScreen>
    );
  }
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { profile } = useAuth();
  if (!profile || !roles.includes(profile.role)) return <Navigate to={paths.dashboard} replace />;
  return <>{children}</>;
}

export function RequireAccess({ allow, children }: { allow: (me: Me) => boolean; children: ReactNode }) {
  const { profile } = useAuth();
  if (!profile || !allow(profile)) return <Navigate to={paths.dashboard} replace />;
  return <>{children}</>;
}

export function RedirectKeepingSearch({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}
