import { z } from "zod";
import { daysQuery } from "../../lib/http/schemas.js";

export const tokenUsageQuerySchema = z.object({ days: daysQuery(7) });

export const qualityQuerySchema = z.object({ days: daysQuery(30) });
