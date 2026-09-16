// One-off script to create the very first admin account. There is no
// self-serve signup (by design — see docs/ARCHITECTURE.md §5), so someone
// has to exist before the Admin page can provision anyone else.
//
// Usage:
//   npm run bootstrap-admin -- --email you@company.com --name "Your Name" --password "a-strong-password"
//
// Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in apps/api/.env.

import "dotenv/config";
import { supabaseAdmin } from "../src/lib/supabase.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email");
  const fullName = arg("name");
  const password = arg("password");

  if (!email || !fullName || !password) {
    console.error('Usage: npm run bootstrap-admin -- --email you@company.com --name "Your Name" --password "..."');
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    console.error("Could not create user:", error?.message);
    process.exit(1);
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: data.user.id,
    email,
    full_name: fullName,
    role: "admin",
  });

  if (profileError) {
    console.error("User created but profile insert failed:", profileError.message);
    process.exit(1);
  }

  console.log(`Admin account created for ${email}. You can now sign in at the web app.`);
}

main();
