export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export function isSupabaseConfigured(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return Boolean(readSupabaseUrl(env) && readServerKey(env));
}

export function getSupabaseConfig(env: Readonly<Record<string, string | undefined>> = process.env): SupabaseConfig {
  const url = readSupabaseUrl(env);
  const serviceRoleKey = readServerKey(env);
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and a server secret (SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY). The publishable key is not enough to read the corpus.",
    );
  }
  return { url, serviceRoleKey };
}

export function readSupabaseUrl(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.NEXT_PUBLIC_SUPABASE_URL?.trim() || env.SUPABASE_URL?.trim() || "";
}

export function readPublishableKey(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    || "";
}

/** Secret / service_role only. Never fall back to the publishable key. */
export function readServerKey(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}
