import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth.ts";
import type { Role } from "../lib/roles.ts";
import { Spinner } from "../ui/Spinner.tsx";
import { paths } from "../../app/paths.ts";

function FullScreenLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <Spinner label="Loading your workspace" />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, profile, profileError } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoading />;
  if (!session) return <Navigate to={paths.login} replace state={{ from: location.pathname }} />;
  if (!profile) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas px-6">
        <div className="max-w-md rounded-xl border border-line bg-surface p-6 text-sm text-ink-700 shadow-sm">
          <p className="font-semibold text-ink-900">Your profile could not be loaded</p>
          <p className="mt-2">{profileError ?? "The API did not return a profile for this account."}</p>
          <p className="mt-2 text-ink-500">Check that the API is running and that an administrator has provisioned your account.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { profile } = useAuth();
  if (!profile || !roles.includes(profile.role)) return <Navigate to={paths.dashboard} replace />;
  return <>{children}</>;
}
