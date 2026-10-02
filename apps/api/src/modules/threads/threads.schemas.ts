import { z } from "zod";
import { agentIdSchema } from "../../lib/http/schemas.js";

const titleSchema = z.string().trim().max(200);

export const agentQuerySchema = z.object({ agentId: agentIdSchema }).strict();

export const createThreadSchema = z.object({ agentId: agentIdSchema, title: titleSchema.optional() }).strict();

export const sendMessageSchema = z.object({ agentId: agentIdSchema, message: z.string().trim().min(1).max(20_000) }).strict();

export const updateThreadSchema = z.object({ agentId: agentIdSchema, title: titleSchema.min(1) }).strict();
