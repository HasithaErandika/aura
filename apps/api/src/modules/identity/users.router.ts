import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../../lib/supabase.js";
import { asyncHandler } from "../../lib/http/async-handler.js";
import { badRequest, conflict, notFound, upstreamError } from "../../lib/http/errors.js";
import { parseOrThrow, uuidParam } from "../../lib/http/validate.js";
import { currentUser, invalidateSessionsFor, requireRole } from "../../middleware/auth.js";
import { writeAudit } from "../audit/audit.service.js";
import { ROLES, ROLE_LABELS, type Role } from "./roles.js";

export const usersRouter = Router();

usersRouter.use(requireRole("admin"));

interface ProfileRow {
  id: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

// GET /users. Identity comes from Supabase Auth; role from `profiles`. Admin only (FR-REG-1).
usersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [{ data: authUsers, error: authError }, { data: profiles, error: profileError }] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
      supabaseAdmin.from("profiles").select("id, full_name, role, created_at"),
    ]);
    if (authError || profileError) throw upstreamError((authError ?? profileError)?.message ?? "user listing failed");

    const profileById = new Map((profiles as ProfileRow[]).map((p) => [p.id, p]));
    const users = authUsers.users.map((u) => {
      const profile = profileById.get(u.id);
      return {
        id: u.id,
        email: u.email,
        fullName: profile?.full_name ?? null,
        role: profile?.role ?? null,
        roleLabel: profile ? ROLE_LABELS[profile.role] : null,
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: profile?.created_at ?? u.created_at,
      };
    });
    res.json({ users });
  }),
);

const createUserSchema = z
  .object({
    email: z.string().email(),
    fullName: z.string().trim().min(1).max(120),
    role: z.enum(ROLES),
    password: z.string().min(8).max(128).optional(),
  })
  .strict();

function generateTempPassword() {
  return randomBytes(9).toString("base64url");
}

// POST /users. Accounts are provisioned by an admin; there is no self-serve signup.
usersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const { email, fullName, role, password } = parseOrThrow(createUserSchema, req.body);
    const tempPassword = password ?? generateTempPassword();

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError || !created.user) throw conflict(createError?.message ?? "Could not create the account");

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({ id: created.user.id, email, full_name: fullName, role });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw upstreamError(profileError.message);
    }

    await writeAudit({
      actorId: admin.id,
      actorRole: admin.role,
      action: "user.created",
      entityType: "user",
      entityId: created.user.id,
      requestId: req.requestId,
      metadata: { email, role },
    });

    res.status(201).json({ id: created.user.id, email, fullName, role, temporaryPassword: password ? undefined : tempPassword });
  }),
);

const updateRoleSchema = z.object({ role: z.enum(ROLES) }).strict();

usersRouter.patch(
  "/:id/role",
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const { role } = parseOrThrow(updateRoleSchema, req.body);
    const targetId = uuidParam(req.params.id, "User");
    if (targetId === admin.id) throw badRequest("You cannot change your own role");

    const { data: before } = await supabaseAdmin.from("profiles").select("role").eq("id", targetId).maybeSingle();
    if (!before) throw notFound("User");
    const { error } = await supabaseAdmin.from("profiles").update({ role }).eq("id", targetId);
    if (error) throw upstreamError(error.message);
    invalidateSessionsFor(targetId);

    await writeAudit({
      actorId: admin.id,
      actorRole: admin.role,
      action: "user.role_changed",
      entityType: "user",
      entityId: targetId,
      requestId: req.requestId,
      metadata: { from: (before as { role?: Role } | null)?.role ?? null, to: role },
    });
    res.json({ id: targetId, role, roleLabel: ROLE_LABELS[role] });
  }),
);

usersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const admin = currentUser(req);
    const targetId = uuidParam(req.params.id, "User");
    if (targetId === admin.id) throw badRequest("You cannot remove your own account");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (error) throw upstreamError(error.message);
    invalidateSessionsFor(targetId);
    await writeAudit({
      actorId: admin.id,
      actorRole: admin.role,
      action: "user.deprovisioned",
      entityType: "user",
      entityId: targetId,
      requestId: req.requestId,
    });
    res.status(204).send();
  }),
);
