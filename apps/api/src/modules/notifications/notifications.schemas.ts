import { z } from "zod";

export const markReadSchema = z.object({ ids: z.array(z.string().uuid()).max(100).optional() }).strict();
