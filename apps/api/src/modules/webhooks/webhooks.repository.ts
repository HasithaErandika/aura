import { dbError, isUniqueViolation } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { Delivery } from "./webhooks.types.js";

export const webhooksRepository = {
  // False when this delivery was already claimed: a retry or a redelivery.
  async claim(delivery: Delivery): Promise<boolean> {
    const { error } = await supabaseAdmin.from("webhook_deliveries").insert({ source: delivery.source, delivery_id: delivery.deliveryId, event: delivery.event });
    if (isUniqueViolation(error)) return false;
    if (error) throw dbError("Could not record the webhook delivery", error);
    return true;
  },

  async release(delivery: Delivery): Promise<void> {
    const { error } = await supabaseAdmin.from("webhook_deliveries").delete().eq("source", delivery.source).eq("delivery_id", delivery.deliveryId);
    if (error) throw dbError("Could not release the webhook delivery", error);
  },
};
