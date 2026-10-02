import { webhooksRepository } from "./webhooks.repository.js";
import type { Delivery, HandlerOutcome, WebhookHandler } from "./webhooks.types.js";

export type DeliveryOutcome = HandlerOutcome | "duplicate";

// Handlers by "<source>:<event>". Later delivery-loop steps add theirs (status, merges, Jira triggers).
export const WEBHOOK_HANDLERS: Record<string, WebhookHandler> = {};

interface Deps {
  claim: (delivery: Delivery) => Promise<boolean>;
  release: (delivery: Delivery) => Promise<void>;
  handlers: Record<string, WebhookHandler>;
}

const defaultDeps: Deps = { claim: (d) => webhooksRepository.claim(d), release: (d) => webhooksRepository.release(d), handlers: WEBHOOK_HANDLERS };

// Handles a delivery at most once; a failed one is released so the sender's retry is handled.
export async function handleDelivery(delivery: Delivery, payload: Record<string, unknown>, deps: Deps = defaultDeps): Promise<DeliveryOutcome> {
  const handler = deps.handlers[`${delivery.source}:${delivery.event}`];
  if (!(await deps.claim(delivery))) return "duplicate";
  if (!handler) return "ignored";
  try {
    return await handler(payload, delivery);
  } catch (error) {
    await deps.release(delivery);
    throw error;
  }
}
