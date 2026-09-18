function requireEnv(name: keyof ImportMetaEnv, fallback?: string): string {
  const value = import.meta.env[name] as string | undefined;
  if (value && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing environment variable ${String(name)}`);
}

export const env = {
  appVersion: __APP_VERSION__,
  apiUrl: requireEnv("VITE_API_URL", "http://localhost:4000").replace(/\/+$/, ""),
  supabaseUrl: requireEnv("VITE_SUPABASE_URL"),
  supabaseAnonKey: requireEnv("VITE_SUPABASE_ANON_KEY"),
  runtimeStudioUrl: requireEnv("VITE_RUNTIME_STUDIO_URL", "http://localhost:4111"),
};
