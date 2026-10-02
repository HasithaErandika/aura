import { Router, type Request } from "express";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { badRequest, unauthenticated } from "../../lib/http/errors.js";
import { logger } from "../../lib/logger.js";
import { writeAudit } from "../audit/index.js";
import { githubDelivery, githubSignature, jiraDelivery, jiraSignature, parsePayload, validSignature } from "./webhooks.parse.js";
import { handleDelivery } from "./webhooks.service.js";
import type { Delivery, WebhookSource } from "./webhooks.types.js";

// Mounted with express.raw(), before the JSON parser: the signature covers the exact bytes sent.
export const webhooksRouter = Router();

interface Source {
  source: WebhookSource;
  secret: () => string | undefined;
  signature: (headers: Request["headers"]) => string | null;
  delivery: (headers: Request["headers"], payload: Record<string, unknown>) => Delivery | null;
}

const SOURCES: Source[] = [
  { source: "github", secret: () => env.githubWebhookSecret, signature: githubSignature, delivery: githubDelivery },
  { source: "jira", secret: () => env.jiraWebhookSecret, signature: jiraSignature, delivery: jiraDelivery },
];

for (const s of SOURCES) {
  webhooksRouter.post(
    `/${s.source}`,
    asyncHandler(async (req, res, next) => {
      const secret = s.secret();
      // Without a secret the endpoint answers like an unknown route: nothing unsigned is accepted.
      if (!secret) return next();
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!validSignature(s.signature(req.headers), secret, body)) {
        logger.warn("webhook signature rejected", { source: s.source, requestId: req.requestId });
        throw unauthenticated("Invalid webhook signature");
      }
      const payload = parsePayload(body);
      if (!payload) throw badRequest("The webhook body must be a JSON object");
      const delivery = s.delivery(req.headers, payload);
      if (!delivery) throw badRequest("The webhook delivery id or event is missing");

      const outcome = await handleDelivery(delivery, payload);
      if (outcome !== "duplicate") {
        await writeAudit({
          actorId: null,
          actorRole: null,
          action: "webhook.received",
          entityType: "webhook",
          entityId: `${delivery.source}:${delivery.deliveryId}`,
          requestId: req.requestId,
          metadata: { source: delivery.source, event: delivery.event, action: delivery.action, subject: delivery.subject, outcome },
        });
      }
      res.json({ outcome });
    }),
  );
}
