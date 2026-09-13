/** Hosted routes import this file so SQLite and the local E5 model stay out of the Vercel bundle. */
export async function getCorpusService() {
  const { isSupabaseConfigured } = await import("../supabase/config");
  if (process.env.VERCEL && !isSupabaseConfigured()) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY before deploying to Vercel.");
  }
  if (isSupabaseConfigured()) {
    const { getSupabaseCorpusService } = await import("./supabase-service");
    return getSupabaseCorpusService();
  }
  const { getSeedCorpusService } = await import("./service");
  return getSeedCorpusService();
}
