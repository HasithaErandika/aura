import { z } from "zod";
import { BRIDGE_OPS } from "@aura/bridge";

export const callSchema = z
  .object({
    runId: z.string().uuid(),
    op: z.enum(BRIDGE_OPS),
    args: z.record(z.string(), z.unknown()),
    timeoutMs: z.number().int().min(1000).max(30 * 60_000).optional(),
    readOnly: z.boolean().optional(),
    worktree: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/).refine((w) => !w.includes(".."), "invalid worktree").optional(),
  })
  .strict();

export type BridgeCall = z.infer<typeof callSchema>;
