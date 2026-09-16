import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth.ts";
import { LogoMark } from "../components/Logo.tsx";

export function Login() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError("Incorrect email or password.");
      return;
    }
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-brand-red text-white">
            <LogoMark className="size-6" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Sign in to AURA</h1>
            <p className="mt-1 text-sm text-sec-grey">Use the credentials your administrator gave you.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {error ? (
            <p className="rounded-lg bg-brand-red/10 px-3 py-2 text-sm font-medium text-brand-red">{error}</p>
          ) : null}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Work email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-red py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-red-dark disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-sec-grey">
          Don&rsquo;t have an account? Ask an admin to create one for you — AURA has no public sign-up.
        </p>
      </div>
    </div>
  );
}
