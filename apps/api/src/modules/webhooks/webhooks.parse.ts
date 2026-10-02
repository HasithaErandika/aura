import { hmacSha256, safeEqual } from "../../lib/hash.js";
import type { Delivery } from "./webhooks.types.js";

type Headers = Record<string, string | string[] | undefined>;

const MAX_ID = 200;
const MAX_EVENT = 100;

function header(headers: Headers, name: string): string | null {
  const value = headers[name.toLowerCase()];
  const first = Array.isArray(value) ? value[0] : value;
  return first && first.length > 0 ? first : null;
}

const text = (value: unknown, max: number): string | null => (typeof value === "string" && value.length > 0 ? value.slice(0, max) : null);

// GitHub (X-Hub-Signature-256) and Jira (X-Hub-Signature) both send "sha256=<hex HMAC of the raw body>".
export function validSignature(signature: string | null, secret: string, body: Buffer): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  return safeEqual(signature.slice("sha256=".length), hmacSha256(secret, body));
}

export function githubSignature(headers: Headers): string | null {
  return header(headers, "x-hub-signature-256");
}

export function jiraSignature(headers: Headers): string | null {
  return header(headers, "x-hub-signature");
}

export function githubDelivery(headers: Headers, payload: Record<string, unknown>): Delivery | null {
  const deliveryId = header(headers, "x-github-delivery");
  const event = header(headers, "x-github-event");
  if (!deliveryId || !event || deliveryId.length > MAX_ID || event.length > MAX_EVENT) return null;
  const repo = (payload.repository as { full_name?: unknown } | undefined)?.full_name;
  const pr = (payload.pull_request as { number?: unknown } | undefined)?.number;
  const subject = typeof repo === "string" ? `${repo}${typeof pr === "number" ? `#${pr}` : ""}` : null;
  return { source: "github", deliveryId, event, action: text(payload.action, MAX_EVENT), subject };
}

// Jira repeats X-Atlassian-Webhook-Identifier on every retry of one delivery.
export function jiraDelivery(headers: Headers, payload: Record<string, unknown>): Delivery | null {
  const deliveryId = header(headers, "x-atlassian-webhook-identifier");
  const event = text(payload.webhookEvent, MAX_EVENT);
  if (!deliveryId || !event || deliveryId.length > MAX_ID) return null;
  const issue = (payload.issue as { key?: unknown } | undefined)?.key;
  return { source: "jira", deliveryId, event, action: text(payload.issue_event_type_name, MAX_EVENT), subject: text(issue, MAX_EVENT) };
}

export function parsePayload(body: Buffer): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body.toString("utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
