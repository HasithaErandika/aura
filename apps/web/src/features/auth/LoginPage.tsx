import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { paths } from "../../app/paths.ts";
import { useAuth } from "../../shared/auth/useAuth.ts";
import { LogoMark, LogoWordmark } from "../../shared/brand/Logo.tsx";
import { ArrowLeftIcon, AuditIcon, GateIcon, TicketIcon } from "../../shared/icons/index.tsx";

const trustPoints = [
  { icon: GateIcon, text: "A human gate before every consequential action" },
  { icon: TicketIcon, text: "Jira stays the single system of record" },
  { icon: AuditIcon, text: "Full provenance on every artifact an agent creates" },
];

export function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) {
    return <Navigate to={paths.dashboard} replace />;
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
    navigate(paths.dashboard, { replace: true });
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between border-r border-line bg-ink-900 px-12 py-10 text-on-dark lg:flex">
        <Link to="/" className="flex items-center gap-2.5">
          <LogoMark className="h-9 w-auto" />
          <LogoWordmark className="text-lg" />
        </Link>

        <div className="max-w-sm">
          <h2 className="text-2xl font-bold leading-snug tracking-tight">
            AI agents that ship software without going off course.
          </h2>
          <ul className="mt-8 space-y-4">
            {trustPoints.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-on-dark/10">
                  <Icon className="size-3.5 text-on-dark" />
                </span>
                <span className="text-sm leading-relaxed text-on-dark/80">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs font-medium text-on-dark/50">&copy; {new Date().getFullYear()} AURA, by Dialog.</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center bg-surface px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-ink-900"
          >
            <ArrowLeftIcon className="size-3.5" /> Back to AURA
          </Link>

          <div className="mt-8 flex flex-col items-start gap-3 lg:hidden">
            <LogoMark className="h-11 w-auto" />
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink-900 lg:mt-10">Sign in to AURA</h1>
          <p className="mt-1.5 text-sm text-ink-500">Use the credentials your administrator gave you.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error ? (
              <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</p>
            ) : null}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-ink-700">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-line-strong px-3 py-2.5 text-sm text-ink-900 focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-ink-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-line-strong px-3 py-2.5 text-sm text-ink-900 focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-on-dark transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-500">
            Don&rsquo;t have an account? Ask an admin to create one for you. AURA has no public sign-up.
          </p>
        </div>
      </div>
    </div>
  );
}
