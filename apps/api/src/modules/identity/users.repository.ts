import type { User } from "@supabase/supabase-js";
import { notFound, upstreamError } from "../../lib/http/errors.js";
import { supabaseAdmin } from "../../lib/supabase.js";

const PAGE_SIZE = 1000;

export const authUsersRepository = {
  async listAll(): Promise<User[]> {
    const users: User[] = [];
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
      if (error) throw upstreamError(error.message);
      users.push(...data.users);
      if (data.users.length < PAGE_SIZE) return users;
    }
  },

  async create(input: { email: string; password: string; fullName: string }): Promise<{ id: string } | { error: string }> {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true, user_metadata: { full_name: input.fullName } });
    if (error || !data.user) return { error: error?.message ?? "Could not create the account" };
    return { id: data.user.id };
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error?.status === 404) throw notFound("User");
    if (error) throw upstreamError(error.message);
  },
};
