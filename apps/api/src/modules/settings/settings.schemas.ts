import { z } from "zod";
import { SETTING_SCOPES } from "./settings.registry.js";

export const keyParamSchema = z.string().min(3).max(80).regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/);

export const listQuerySchema = z
  .object({ scope: z.enum(["global", "project"]), scopeId: z.string().uuid().optional() })
  .strict()
  .refine((q) => q.scope !== "project" || q.scopeId, { message: "Required for project scope", path: ["scopeId"] });

export const effectiveQuerySchema = z.object({ projectId: z.string().uuid().optional(), mine: z.enum(["true", "false"]).optional() }).strict();

export const targetSchema = z.object({ scope: z.enum(SETTING_SCOPES), scopeId: z.string().uuid().nullish() }).strict();

export const putBodySchema = targetSchema.extend({ value: z.union([z.string(), z.number(), z.boolean()]) }).strict();
