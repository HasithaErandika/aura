import { z } from "zod";
import { ROLES } from "../../lib/auth/roles.js";

export const createTokenSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    expiresInDays: z.number().int().min(1).max(365).default(90),
  })
  .strict();

export const createUserSchema = z
  .object({
    email: z.string().email(),
    fullName: z.string().trim().min(1).max(120),
    role: z.enum(ROLES),
    password: z.string().min(8).max(128).optional(),
  })
  .strict();

export const updateRoleSchema = z.object({ role: z.enum(ROLES) }).strict();

export const deviceStartSchema = z.object({ clientName: z.string().trim().min(1).max(80).default("VS Code") }).strict();

export const deviceTokenSchema = z.object({ deviceCode: z.string().min(20).max(100) }).strict();

export const deviceCodeSchema = z.object({ userCode: z.string().trim().min(4).max(20) }).strict();
