import { z } from "zod";
import { enumList, limitQuery } from "../../lib/http/schemas.js";
import { RUN_STATUSES } from "./runs.types.js";

export const listQuerySchema = z.object({ status: enumList(RUN_STATUSES), limit: limitQuery(200, 50) }).strict();

// "turn" starts after the last "done", i.e. at the current turn.
export const eventsQuerySchema = z.object({ after: z.union([z.literal("turn"), z.coerce.number().int().min(0)]).default(0) }).strict();

export const noteSchema = z.object({ text: z.string().trim().min(1).max(4000) }).strict();
