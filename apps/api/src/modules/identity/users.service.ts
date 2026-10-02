import { randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { ROLE_LABELS, type Role } from "../../lib/auth/roles.js";
import { badRequest, conflict, notFound } from "../../lib/http/errors.js";
import type { ProfileRow, UserView } from "./identity.types.js";
import { profilesRepository } from "./profiles.repository.js";
import { invalidateSessionsFor } from "./session.service.js";
import { authUsersRepository } from "./users.repository.js";

function toUserView(user: User, profile: ProfileRow | undefined): UserView {
  return {
    id: user.id,
    email: user.email,
    fullName: profile?.full_name ?? null,
    role: profile?.role ?? null,
    roleLabel: profile ? ROLE_LABELS[profile.role] : null,
    lastSignInAt: user.last_sign_in_at ?? null,
    createdAt: profile?.created_at ?? user.created_at,
  };
}

export async function listUsers(): Promise<UserView[]> {
  const [users, profiles] = await Promise.all([authUsersRepository.listAll(), profilesRepository.listAll()]);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return users.map((user) => toUserView(user, byId.get(user.id)));
}

export async function createUser(input: { email: string; fullName: string; role: Role; password?: string }): Promise<{ id: string; temporaryPassword?: string }> {
  const password = input.password ?? randomBytes(9).toString("base64url");
  const created = await authUsersRepository.create({ email: input.email, password, fullName: input.fullName });
  if ("error" in created) throw conflict(created.error);
  try {
    await profilesRepository.insert({ id: created.id, email: input.email, fullName: input.fullName, role: input.role });
  } catch (error) {
    await authUsersRepository.remove(created.id).catch(() => undefined);
    throw error;
  }
  return { id: created.id, temporaryPassword: input.password ? undefined : password };
}

export async function changeRole(actorId: string, targetId: string, role: Role): Promise<{ from: Role }> {
  if (targetId === actorId) throw badRequest("You cannot change your own role");
  const before = await profilesRepository.find(targetId);
  if (!before) throw notFound("User");
  await profilesRepository.updateRole(targetId, role);
  invalidateSessionsFor(targetId);
  return { from: before.role };
}

export async function removeUser(actorId: string, targetId: string): Promise<void> {
  if (targetId === actorId) throw badRequest("You cannot remove your own account");
  await authUsersRepository.remove(targetId);
  invalidateSessionsFor(targetId);
}
