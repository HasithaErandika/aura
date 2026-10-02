import { z } from "zod";

// Mirrors the CHECK constraints of migration 0007 so bad values get a 422.
const upperKey = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]{1,31}$/, "2-32 characters: a letter, then letters, digits or _");

export const createProjectSchema = z
  .object({
    key: upperKey,
    name: z.string().trim().min(1).max(120),
    jiraProjectKey: upperKey,
  })
  .strict();

// git check-ref-format, simplified.
const branchName = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((b) => !/(^[/.-])|([/.]$)|\.\.|[\s~^:?*[\\]|@\{|\/\//.test(b) && !b.endsWith(".lock"), "Not a valid branch name");

export const repositorySchema = z
  .object({
    provider: z.enum(["github", "local"]),
    owner: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/, "Letters, digits, _ . - only"),
    name: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_.-]{1,100}$/, "Letters, digits, _ . - only")
      .refine((n) => n !== "." && n !== "..", "Not a valid repository name"),
    defaultBranch: branchName.default("main"),
    installationId: z.number().int().positive().optional(),
  })
  .strict()
  .refine((r) => r.provider === "github" || r.installationId === undefined, {
    message: "Only GitHub repositories have an installation id",
    path: ["installationId"],
  });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type RepositoryInput = z.infer<typeof repositorySchema>;

export const memberSchema = z.object({ userId: z.string().uuid() }).strict();
