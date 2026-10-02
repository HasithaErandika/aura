import { describe, expect, it, vi } from "vitest";
import { hmacSha256 } from "../../lib/hash.js";
import { githubDelivery, jiraDelivery, parsePayload, validSignature } from "./webhooks.parse.js";
import { handleDelivery } from "./webhooks.service.js";
import type { Delivery, WebhookHandler } from "./webhooks.types.js";

const secret = "s3cret";
const body = Buffer.from(JSON.stringify({ action: "closed", pull_request: { number: 7 }, repository: { full_name: "acme/tickets" } }));
const signed = `sha256=${hmacSha256(secret, body)}`;

describe("webhook signatures", () => {
  it("accepts only an HMAC-SHA256 of the exact body with the shared secret", () => {
    expect(validSignature(signed, secret, body)).toBe(true);
    expect(validSignature(signed, "other", body)).toBe(false);
    expect(validSignature(signed, secret, Buffer.concat([body, Buffer.from(" ")]))).toBe(false);
    expect(validSignature(signed.replace("sha256=", "sha1="), secret, body)).toBe(false);
    expect(validSignature(null, secret, body)).toBe(false);
    expect(validSignature("sha256=", secret, body)).toBe(false);
  });
});

describe("webhook deliveries", () => {
  it("reads a GitHub delivery's id, event and subject", () => {
    const payload = parsePayload(body)!;
    expect(githubDelivery({ "x-github-delivery": "d-1", "x-github-event": "pull_request" }, payload)).toEqual({
      source: "github",
      deliveryId: "d-1",
      event: "pull_request",
      action: "closed",
      subject: "acme/tickets#7",
    });
    expect(githubDelivery({ "x-github-event": "pull_request" }, payload)).toBeNull();
    expect(githubDelivery({ "x-github-delivery": "x".repeat(201), "x-github-event": "ping" }, payload)).toBeNull();
  });

  it("reads a Jira delivery's id, event and issue", () => {
    const payload = { webhookEvent: "jira:issue_updated", issue_event_type_name: "issue_generic", issue: { key: "KAN-45" } };
    expect(jiraDelivery({ "x-atlassian-webhook-identifier": "j-1" }, payload)).toEqual({
      source: "jira",
      deliveryId: "j-1",
      event: "jira:issue_updated",
      action: "issue_generic",
      subject: "KAN-45",
    });
    expect(jiraDelivery({}, payload)).toBeNull();
    expect(jiraDelivery({ "x-atlassian-webhook-identifier": "j-1" }, { issue: { key: "KAN-45" } })).toBeNull();
  });

  it("accepts only a JSON object body", () => {
    expect(parsePayload(Buffer.from("[1,2]"))).toBeNull();
    expect(parsePayload(Buffer.from("not json"))).toBeNull();
    expect(parsePayload(Buffer.from("null"))).toBeNull();
    expect(parsePayload(Buffer.from('{"a":1}'))).toEqual({ a: 1 });
  });
});

describe("handling a delivery", () => {
  const delivery: Delivery = { source: "github", deliveryId: "d-1", event: "pull_request", action: "closed", subject: "acme/tickets#7" };

  function deps(handlers: Record<string, WebhookHandler> = {}) {
    const claimed = new Set<string>();
    return {
      claim: vi.fn(async (d: Delivery) => (claimed.has(d.deliveryId) ? false : (claimed.add(d.deliveryId), true))),
      release: vi.fn(async (d: Delivery) => void claimed.delete(d.deliveryId)),
      handlers,
    };
  }

  it("handles a delivery once and answers a repeat as a duplicate", async () => {
    const handler = vi.fn(async () => "handled" as const);
    const d = deps({ "github:pull_request": handler });
    expect(await handleDelivery(delivery, {}, d)).toBe("handled");
    expect(await handleDelivery(delivery, {}, d)).toBe("duplicate");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("records an event nobody handles yet as ignored", async () => {
    const d = deps();
    expect(await handleDelivery(delivery, {}, d)).toBe("ignored");
    expect(await handleDelivery(delivery, {}, d)).toBe("duplicate");
  });

  it("releases a failed delivery so the sender's retry is handled", async () => {
    const handler = vi.fn().mockRejectedValueOnce(new Error("Jira down")).mockResolvedValueOnce("handled");
    const d = deps({ "github:pull_request": handler });
    await expect(handleDelivery(delivery, {}, d)).rejects.toThrow("Jira down");
    expect(d.release).toHaveBeenCalledOnce();
    expect(await handleDelivery(delivery, {}, d)).toBe("handled");
  });
});
