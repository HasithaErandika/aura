import { z } from "zod";

export const searchQuerySchema = z.object({ q: z.string().trim().max(200).optional() });

export const transitionBodySchema = z.object({ transitionId: z.string().trim().min(1).max(32) }).strict();

export const commentBodySchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();
