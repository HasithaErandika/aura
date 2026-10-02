export type WebhookSource = "github" | "jira";

// What AURA keeps about one delivery: enough to drop repeats and audit it, never the payload.
export interface Delivery {
  source: WebhookSource;
  deliveryId: string;
  event: string;
  action: string | null;
  subject: string | null;
}

export type HandlerOutcome = "handled" | "ignored";

export type WebhookHandler = (payload: Record<string, unknown>, delivery: Delivery) => Promise<HandlerOutcome>;
