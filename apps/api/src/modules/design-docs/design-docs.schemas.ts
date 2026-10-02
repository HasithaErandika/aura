import { z } from "zod";
import { enumList, jiraKeySchema } from "../../lib/http/schemas.js";
import { DOC_KINDS } from "./design-docs.types.js";

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9/_.-]{0,199}$/, "lowercase letters, digits, / _ . -");
const titleSchema = z.string().trim().min(1).max(300);
const contentSchema = z.string().max(500_000);

export const createDocSchema = z
  .object({
    epicKey: jiraKeySchema,
    kind: z.enum(DOC_KINDS),
    title: titleSchema,
    slug: slugSchema.optional(),
    issueKey: jiraKeySchema.nullish(),
    content: contentSchema,
  })
  .strict();
export type CreateDocInput = z.infer<typeof createDocSchema>;

export const saveVersionSchema = z
  .object({
    content: contentSchema,
    baseVersion: z.number().int().min(1),
    note: z.string().trim().max(500).optional(),
    title: titleSchema.optional(),
  })
  .strict();
export type SaveVersionInput = z.infer<typeof saveVersionSchema>;

export const kindsQuerySchema = z.object({ kind: enumList(DOC_KINDS) }).strict();

export const listQuerySchema = z.object({ epicKey: jiraKeySchema.optional(), kind: enumList(DOC_KINDS) }).strict();

export const versionQuerySchema = z.object({ version: z.coerce.number().int().min(1).optional() }).strict();

export const agentWriteSchema = z
  .object({
    epicKey: jiraKeySchema,
    kind: z.enum(DOC_KINDS),
    slug: slugSchema,
    title: titleSchema,
    issueKey: jiraKeySchema.nullish(),
    content: contentSchema,
    agent: z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/),
    draftId: z.string().min(1).max(128).optional(),
  })
  .strict();
export type AgentWriteInput = z.infer<typeof agentWriteSchema>;
