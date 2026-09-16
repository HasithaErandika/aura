import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabase.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ROLES, ROLE_LABELS, type Role } from "../lib/roles.js";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole("admin"));

interface ProfileRow {
  id: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

// GET /users — list every account with its role. Auth identity comes from
// Supabase Auth; role/profile data comes from the `profiles` table (see
// supabase/schema.sql). Admin-only (FR-REG-1).
usersRouter.get("/", async (_req, res) => {
  const [{ data: authUsers, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers(),
    supabaseAdmin.from("profiles").select("id, full_name, role, created_at"),
  ]);

  if (authError || profileError) {
    return res.status(502).json({ error: (authError ?? profileError)?.message });
  }

  const profileById = new Map((profiles as ProfileRow[]).map((p) => [p.id, p]));

  const users = authUsers.users.map((u) => {
    const profile = profileById.get(u.id);
    return {
      id: u.id,
      email: u.email,
      fullName: profile?.full_name ?? null,
      role: profile?.role ?? null,
      roleLabel: profile ? ROLE_LABELS[profile.role] : null,
      lastSignInAt: u.last_sign_in_at,
      createdAt: profile?.created_at ?? u.created_at,
    };
  });

  res.json({ users });
});

const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  role: z.enum(ROLES),
  password: z.string().min(8).optional(),
});

function generateTempPassword() {
  return randomBytes(9).toString("base64url");
}

// POST /users — admin provisions an account directly; there is no self-serve
// signup (FR §5.1 Gate concept: even account creation is a deliberate human
// action, not an open flow).
usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, fullName, role, password } = parsed.data;
  const tempPassword = password ?? generateTempPassword();

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    return res.status(409).json({ error: createError?.message ?? "could not create user" });
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: created.user.id,
    email,
    full_name: fullName,
    role,
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return res.status(500).json({ error: profileError.message });
  }

  res.status(201).json({
    id: created.user.id,
    email,
    fullName,
    role,
    temporaryPassword: password ? undefined : tempPassword,
  });
});

const updateRoleSchema = z.object({ role: z.enum(ROLES) });

// PATCH /users/:id/role — change a user's role (Registry grant editing, FR-REG-1/2).
usersRouter.patch("/:id/role", async (req, res) => {
  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: "cannot change your own role" });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", req.params.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ id: req.params.id, role: parsed.data.role });
});

// DELETE /users/:id — deprovision an account.
usersRouter.delete("/:id", async (req, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: "cannot delete your own account" });
  }
  const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(204).send();
});
