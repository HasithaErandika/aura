import { z } from "zod";
import { limitQuery } from "../../lib/http/schemas.js";

const filterShape = {
  action: z.string().trim().max(80).optional(),
  actorId: z.string().uuid().optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(128).optional(),
};

export const listQuerySchema = z.object({
  ...filterShape,
  before: z.string().datetime().optional(),
  limit: limitQuery(200, 100),
});

export const exportQuerySchema = z.object({
  ...filterShape,
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export type AuditExportQuery = z.infer<typeof exportQuerySchema>;
