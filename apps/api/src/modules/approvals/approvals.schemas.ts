import { z } from "zod";
import { enumList, limitQuery } from "../../lib/http/schemas.js";
import { APPROVAL_STATUSES, DECISIONS } from "./approvals.types.js";

export const listQuerySchema = z.object({ status: enumList(APPROVAL_STATUSES), limit: limitQuery(200, 50) }).strict();

export const decideSchema = z
  .object({
    decision: z.enum(DECISIONS),
    answer: z.string().trim().max(4000).optional(),
    reason: z.string().trim().max(4000).optional(),
    snapshotHash: z.string().length(64).optional(),
  })
  .strict();
