import { createHmac, timingSafeEqual } from "node:crypto";

// Local verification of a Supabase access token (HS256). Used only when SUPABASE_JWT_SECRET
// is configured; otherwise the middleware falls back to Supabase Auth's getUser.

export interface VerifiedClaims {
  sub: string;
  email?: string;
  exp: number;
  aud?: string | string[];
  role?: string;
}

export function verifyHs256(token: string, secret: string): VerifiedClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];

  let headerJson: { alg?: string };
  try {
    headerJson = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: string };
  } catch {
    return null;
  }
  if (headerJson.alg !== "HS256") return null;

  const expected = Buffer.from(createHmac("sha256", secret).update(`${header}.${payload}`).digest().toString("base64url"));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  let claims: VerifiedClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as VerifiedClaims;
  } catch {
    return null;
  }
  if (typeof claims.sub !== "string" || typeof claims.exp !== "number") return null;
  if (claims.exp * 1000 <= Date.now()) return null;
  const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (aud.length > 0 && !aud.includes("authenticated")) return null;
  return claims;
}
