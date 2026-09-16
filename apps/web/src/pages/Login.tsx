import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth.ts";
import { LogoMark, LogoWordmark } from "../components/Logo.tsx";
import { GateIcon, TicketIcon, AuditIcon } from "../components/icons.tsx";

const trustPoints = [
  { icon: GateIcon, text: "A human gate before every consequential action" },
  { icon: TicketIcon, text: "Jira stays the single system of record" },
  { icon: AuditIcon, text: "Full provenance on every artifact an agent creates" },
];

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
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-red-dark px-12 py-10 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 15%, rgba(255,255,255,0.10), transparent 45%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.08), transparent 45%)",
          }}
        />
        <Link to="/" className="relative flex items-center gap-2.5">
          <LogoMark className="h-9 w-auto" />
          <LogoWordmark className="text-lg" />
        </Link>

        <div className="relative max-w-sm">
          <h2 className="text-2xl font-extrabold leading-snug tracking-tight">
            AI agents that ship software without going off course.
          </h2>
          <ul className="mt-8 space-y-4">
            {trustPoints.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <Icon className="size-3.5 text-white" />
                </span>
                <span className="text-sm leading-relaxed text-white/85">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs font-medium text-white/50">&copy; {new Date().getFullYear()} AURA, by Dialog.</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center bg-white px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sec-grey transition-colors hover:text-slate-900"
          >
            <span aria-hidden>&larr;</span> Back to AURA
          </Link>

          <div className="mt-8 flex flex-col items-start gap-3 lg:hidden">
            <LogoMark className="h-11 w-auto" />
          </div>

          <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-900 lg:mt-10">Sign in to AURA</h1>
          <p className="mt-1.5 text-sm text-sec-grey">Use the credentials your administrator gave you.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
            Don&rsquo;t have an account? Ask an admin to create one for you. AURA has no public sign-up.
          </p>
        </div>
      </div>
    </div>
  );
}
