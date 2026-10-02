import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
const JWKS_TTL_MS = 60 * 60_000;
const CLOCK_SKEW_S = 60;

export interface GithubOidcClaims {
  repository: string;
  sha: string;
  ref: string;
  event_name: string;
  run_id: string;
  workflow: string;
}

export class OidcError extends Error {}

type Jwks = { keys: (JsonWebKey & { kid?: string })[] };
type JwksSource = () => Promise<Jwks>;

let cached: { at: number; jwks: Jwks } | null = null;
const githubJwks: JwksSource = async () => {
  if (cached && Date.now() - cached.at < JWKS_TTL_MS) return cached.jwks;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new OidcError(`GitHub's signing keys are unavailable (${res.status})`);
  cached = { at: Date.now(), jwks: (await res.json()) as Jwks };
  return cached.jwks;
};

function part(segment: string | undefined): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(segment ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new OidcError("Malformed token");
  }
}

export async function verifyGithubOidc(token: string, options: { audience: string; jwks?: JwksSource; now?: () => number }): Promise<GithubOidcClaims> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new OidcError("Malformed token");
  const header = part(h);
  if (header.alg !== "RS256") throw new OidcError("Unsupported token algorithm");
  let keys = (await (options.jwks ?? githubJwks)()).keys;
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk && !options.jwks) {
    // GitHub rotated its keys since they were cached.
    cached = null;
    keys = (await githubJwks()).keys;
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new OidcError("Unknown signing key");
  const ok = verify("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(s, "base64url"));
  if (!ok) throw new OidcError("Invalid token signature");

  const claims = part(p);
  const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
  if (claims.iss !== GITHUB_OIDC_ISSUER) throw new OidcError("Token not issued by GitHub Actions");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(options.audience)) throw new OidcError("Token audience is not AURA");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < now) throw new OidcError("Token expired");
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_S > now) throw new OidcError("Token not yet valid");
  for (const key of ["repository", "sha"] as const) if (typeof claims[key] !== "string" || !claims[key]) throw new OidcError(`Token has no ${key}`);
  return {
    repository: String(claims.repository),
    sha: String(claims.sha),
    ref: String(claims.ref ?? ""),
    event_name: String(claims.event_name ?? ""),
    run_id: String(claims.run_id ?? ""),
    workflow: String(claims.workflow ?? ""),
  };
}
