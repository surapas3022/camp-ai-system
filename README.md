# AI System v0 — Lab 4 fast-start

This is the Lab 4 fast-start. It begins at the completed Lab 3 `agent-v3` milestone and adds `/system`, a staff-run release-criteria dashboard.

The product works today: cited RAG chat, staff sessions, authorized retrieval, guardrails, poisoned-source quarantine, citation validation, privacy-minimised audits, the bounded agent workspace with human approval, a versioned 12-case evaluation suite grouped into eight release-gate outcomes, bounded metrics and an automatic release gate, privacy-minimised operational events, a server-owned feedback endpoint, and bounded provider retries that end in a safe error. A named human release decision, product communication, and the evidence bundle are still pending. Local Docker uses SQLite. Vercel uses Supabase for the corpus and runtime tables.

Start by inspecting the agent workspace at `/agent` and the release-criteria dashboard at `/system`.

## Setup (Docker — no local Node/npm required)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose).

```bash
cd ai-system-v0
cp .env.example .env.local
docker compose up --build
```

Open http://localhost:3001 after the dev server starts (port 3001 avoids clashes with other local services on 3000).

Edit `.env.local` with your API keys and staff-session values (see below), then restart:

```bash
docker compose down
docker compose up
```

Other commands (all run inside the container):

```bash
docker compose run --rm app npm test
docker compose run --rm app npm run build
docker compose run --rm app npm run verify:secure-corpus
```

Generate staff-session values without local Node:

```bash
docker compose run --rm app npm run generate:staff-session -- choose-a-staff-pin
```

Reset learner runtime data (removes Docker volumes for runtime DB and model cache):

```bash
docker compose down -v
```

## Setup (local Node)

```bash
cd starter/ai-system-v0
npm install
cp .env.example .env.local
npm run dev
```

Set these server-only variables in `.env.local` before asking the model for an answer:

- `OPENAI_BASE_URL` — NVIDIA Build OpenAI-compatible base URL, usually `https://integrate.api.nvidia.com/v1`
- `OPENAI_API_KEY` — NVIDIA Build API key
- `OPENAI_MODEL` — selected chat model
- `OPENAI_DISABLE_THINKING` — optional `true`/`false` override
- `SESSION_SECRET` — random secret used to sign the staff-session cookie
- `STAFF_PIN_SCRYPT_HASH` — scrypt hash of the shared staff PIN; escape each dollar sign in `.env.local` as `\$`
- `AUDIT_FINGERPRINT_SECRET` — separate HMAC secret for audit, chunk, citation, task, and draft fingerprints; required in production and must not reuse `SESSION_SECRET`
- `SECURE_RAG_MODEL_CACHE` — optional writable cache for local `Xenova/multilingual-e5-small` query embeddings
- `SECURE_RAG_RUNTIME_DIR` — optional writable directory for the learner runtime database and copied PDFs
- `NEXT_PUBLIC_SUPABASE_URL` — hosted project URL (required on Vercel)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — publishable/anon key; enough to ping the project, not enough to read the corpus
- `SUPABASE_SECRET_KEY` — server-only secret (or legacy `SUPABASE_SERVICE_ROLE_KEY`); never prefix with `NEXT_PUBLIC_`

## Deploy (Vercel + Supabase)

Local Docker still uses SQLite until `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set in `.env.local`. Vercel has no writable disk and cannot load `sqlite-vec`, so production uses Supabase for the corpus and runtime tables. PDFs stay in `data/seed/source-files` and are traced into the serverless bundle.

1. Create a [Supabase](https://supabase.com/dashboard) project. In the SQL editor (or `npx supabase db push` after `supabase link`), apply `supabase/migrations/20260913120000_init.sql`.
2. Copy `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the new API keys page, then add `SUPABASE_SECRET_KEY` from the same page (Secret keys).
3. Set `AUDIT_FINGERPRINT_SECRET` to a unique random value (not `SESSION_SECRET`).
4. Test the connection from Docker (reads `.env.local`, does not start the app):

```bash
docker compose run --rm app npm run check:supabase
```

5. If the check reports `documents=0`, push the seed corpus:

```bash
docker compose run --rm app npm run push:supabase
```

6. Restart the app. With the URL and secret key set, local Next.js uses Supabase instead of SQLite:

```bash
docker compose down
docker compose up
```

7. Create a Vercel project from this directory. Add the same env vars (`OPENAI_*`, `SESSION_SECRET`, `STAFF_PIN_SCRYPT_HASH`, `AUDIT_FINGERPRINT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`). Do not put the secret key in a `NEXT_PUBLIC_` variable.
8. Deploy. Semantic retrieval on Vercel falls back to keyword search so the E5 model is not downloaded in the serverless function.

Leave `SUPABASE_SECRET_KEY` empty to switch local Docker back to SQLite. See `supabase/README.md` for CLI notes.

Every provider key stays in the server environment. The browser never receives a key and cannot choose a provider.

Generate the staff-session values without storing a plaintext PIN:

```bash
npm run generate:staff-session -- choose-a-staff-pin
```

Verify the starter:

```bash
npm test
npm run build
npm run verify:secure-corpus
```

## Routes in this starter

| Route | State | Notes |
| --- | --- | --- |
| `/` | Working | Cited RAG chat with English/Thai text. |
| `/knowledge` | Working | Authorized document ledger and source inspection. |
| `/security` | Working | Staff-only, privacy-minimised audit review. |
| `/agent` | Working | Bounded agent workspace: plan, evidence, draft, approval, trace. |
| `/system` | Working | Release-criteria dashboard: evaluation runner, metrics, automatic gate, bounded feedback. |

The API routes are `/api/session`, `/api/answer`, `/api/knowledge/*`, `/api/security/audit`, `/api/agent/run`, `/api/agent/approve`, `POST /api/feedback`, and `/api/system/evaluation`.

## The nine Lab 4 TODOs

1. Evaluation dataset and expected outcomes — done (`data/evaluation/v1.json`).
2. Evaluation runner — done (fixture or provider via `POST /api/system/evaluation`).
3. Quality and evidence metrics: answer quality, citation support, safe stops, latency, error rate, and approximate cost — done.
4. Privacy-minimised observability — done (operational events and aggregates).
5. Controlled feedback capture through a server-owned endpoint — done (`POST /api/feedback`).
6. Fallback and failure behaviour that separates provider or quota failures from safe refusals — done (one bounded retry, then a safe error).
7. Release criteria and a human release or no-release decision (an automatic eight-group gate exists; a named human decision is still pending).
8. Product onboarding, empty states, error states, and feedback affordance.
9. Evidence bundle and final demo.

`tests/lab4.todo.test.ts` still skips the remaining human-decision target. Do not enable that until the matching capability exists.

## What this starter still does not claim

- No named human release or no-release decision is stored.
- No telemetry or analytics vendor SDK and no provider monitoring integration.
- No automatic release when the evaluation gate passes.
- No browser-visible provider key and no client-controlled provider choice.
- No fabricated passing scores when no evaluation run exists.

## Seed bootstrap and reset

`data/seed/` is read-only starter material: `secure-rag.sqlite`, its manifest, and 48 synthetic source PDFs. On first server use, the app copies the database and PDFs to `data/runtime/` (or `SECURE_RAG_RUNTIME_DIR`). It does not overwrite an existing runtime database.

Reset only a learner runtime; do not regenerate or edit the supplied corpus:

```bash
rm -rf data/runtime
# or: rm -rf "$SECURE_RAG_RUNTIME_DIR"
```

Task and trace tables live in the runtime database, so the reset also clears them.

## Fix the corpus, do not regenerate it

Do not run `scripts/build_secure_seed_db.mjs` or `scripts/generate_seed_pdfs.py` for lab setup. They are corpus-production tooling. Do not edit or re-embed `data/seed/` unless a documented compatibility fix is essential.

## SQLite-vec notes

`sqlite-vec` is a native SQLite extension and `better-sqlite3` is a native addon. Use Node 20–22 on a platform with a compatible binary/toolchain, then reinstall dependencies after changing Node versions. If the vector extension cannot load, keyword retrieval and corpus verification report the platform problem. Do not replace or regenerate the supplied database as a workaround.
