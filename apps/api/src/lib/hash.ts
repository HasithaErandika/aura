import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hmacSha256(secret: string, body: Buffer | string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}
