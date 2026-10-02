import { createHmac } from "node:crypto";
import { safeEqual } from "../hash.js";

export interface VerifiedClaims {
  sub: string;
  email?: string;
  exp: number;
  aud?: string | string[];
  role?: string;
}

function decode<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function verifyHs256(token: string, secret: string): VerifiedClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  if (decode<{ alg?: string }>(header)?.alg !== "HS256") return null;

  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  if (!safeEqual(expected, signature)) return null;

  const claims = decode<VerifiedClaims>(payload);
  if (!claims || typeof claims.sub !== "string" || typeof claims.exp !== "number") return null;
  if (claims.exp * 1000 <= Date.now()) return null;
  const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (aud.length > 0 && !aud.includes("authenticated")) return null;
  return claims;
}
