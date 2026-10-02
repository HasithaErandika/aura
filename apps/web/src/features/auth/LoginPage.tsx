import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import { useAuth } from "@/shared/auth/useAuth.ts";
import { LogoMark } from "@/shared/brand/Logo.tsx";
import { ArrowLeftIcon } from "@/shared/icons/index.tsx";
import { Alert } from "@/shared/ui/Alert.tsx";
import { Button } from "@/shared/ui/Button.tsx";
import { Field } from "@/shared/ui/Field.tsx";
import { Input } from "@/shared/ui/Input.tsx";
import { BrandPanel } from "./components/BrandPanel.tsx";

function safeReturnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" && from.startsWith("/app") ? from : paths.dashboard;
}

export function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = safeReturnPath(location.state);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) return <Navigate to={returnTo} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (result.error) {
      setError("Incorrect email or password.");
      return;
    }
    navigate(returnTo, { replace: true });
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <BrandPanel />
      <main className="flex flex-col justify-center bg-surface px-4 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link to={paths.landing} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-ink-900">
            <ArrowLeftIcon className="size-3.5" aria-hidden /> Back to AURA
          </Link>
          <LogoMark className="mt-8 h-11 w-auto lg:hidden" />
          <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink-900 lg:mt-10">Sign in to AURA</h1>
          <p className="mt-1.5 text-sm text-ink-500">Use the credentials your administrator gave you.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label="Work email" htmlFor="email">
              <Input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="h-10" />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" />
            </Field>
            <Button type="submit" variant="primary" loading={submitting} className="h-10 w-full">
              {submitting ? "Signing in" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-500">No account? Ask an admin to create one. AURA has no public sign-up.</p>
        </div>
      </main>
    </div>
  );
}
