# Supabase

This app uses a **server-only** Supabase secret/service-role client. Staff access still comes from the existing PIN session cookie. Do not put `SUPABASE_SECRET_KEY` in `NEXT_PUBLIC_*` variables or browser code.

## Create the project

1. Create a project at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Enable the `vector` extension if the migration does not (Dashboard → Database → Extensions).
3. Apply `migrations/20260913120000_init.sql` with the SQL editor, or:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

4. Copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` into `.env.local` and the Vercel project environment.

5. Ping from Docker before deploying (reads `.env.local`):

```bash
docker compose run --rm app npm run check:supabase
```

6. Push the seed corpus (needs the local SQLite seed plus the service role key):

```bash
docker compose run --rm app npm run push:supabase
```
