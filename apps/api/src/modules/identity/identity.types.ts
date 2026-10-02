import type { Role } from "../../lib/auth/roles.js";

export interface ProfileSummary {
  id: string;
  fullName: string | null;
  email: string;
}

export interface Person {
  fullName: string | null;
  email: string;
}

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface TokenRow {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  revoked_at: string | null;
}

export interface TokenView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revoked: boolean;
  expired: boolean;
}

export interface UserView {
  id: string;
  email: string | undefined;
  fullName: string | null;
  role: Role | null;
  roleLabel: string | null;
  lastSignInAt: string | null;
  createdAt: string;
}
