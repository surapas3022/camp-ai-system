import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

let client: SupabaseClient | undefined;

/** Server-only client. The service role bypasses RLS and must never reach the browser. */
export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;
  const config = getSupabaseConfig();
  client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
