#!/usr/bin/env node
/* Ping Supabase from .env.local without starting Next.js. Does not print secrets. */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load_env_local.mjs";

loadEnvLocal();

function env(name) {
  return process.env[name]?.trim() || "";
}

function jwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : "";
  } catch {
    return "";
  }
}

function keyKind(token) {
  if (token.startsWith("sb_publishable_")) return "publishable";
  if (token.startsWith("sb_secret_")) return "secret";
  const role = jwtRole(token);
  if (role === "service_role") return "service_role";
  if (role === "anon") return "anon";
  return "unknown";
}

function fail(message, hint) {
  console.log(`FAIL  ${message}`);
  if (hint) console.log(`      ${hint}`);
  process.exit(1);
}

async function count(client, table) {
  const { count: value, error } = await client.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return value ?? 0;
}

function isMissingTable(message) {
  return /could not find the table|schema cache|relation .* does not exist/i.test(message);
}

function isRlsDenied(message) {
  return /permission denied|row-level security|rls/i.test(message);
}

async function pingUrl(url, apikey) {
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
    headers: { apikey },
  });
  if (!response.ok) {
    throw new Error(`Auth health returned HTTP ${response.status}`);
  }
}

async function inspectCorpus(client) {
  const documents = await count(client, "documents");
  const chunks = await count(client, "chunks");
  const { error: rpcError } = await client.rpc("match_chunks", {
    query_embedding: Array.from({ length: 384 }, () => 0),
    match_count: 1,
    filter_role: "public",
  });
  if (rpcError && !/results|zero|cancel/i.test(rpcError.message)) {
    console.log(`WARN  match_chunks RPC: ${rpcError.message}`);
  } else {
    console.log("OK    match_chunks RPC reachable");
  }
  console.log(`OK    documents=${documents}  chunks=${chunks}`);
  return documents;
}

async function main() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL");
  const serverKey = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url) {
    fail(
      "NEXT_PUBLIC_SUPABASE_URL is empty.",
      "Paste the project URL from Supabase → Project Settings → API into .env.local.",
    );
  }
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/i.test(url.replace(/\/$/, ""))) {
    console.log(`WARN  URL does not look like https://<ref>.supabase.co  (${url})`);
  }
  if (!publishableKey && !serverKey) {
    fail(
      "No Supabase key found.",
      "Keep NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and add SUPABASE_SECRET_KEY from the same API page.",
    );
  }

  console.log(`OK    URL ${url}`);
  if (publishableKey) console.log(`OK    publishable key present (${keyKind(publishableKey)})`);

  if (publishableKey) {
    try {
      await pingUrl(url, publishableKey);
      console.log("OK    project reachable (auth health)");
    } catch (error) {
      fail(
        error instanceof Error ? error.message : String(error),
        "Check NEXT_PUBLIC_SUPABASE_URL and that the project is not paused.",
      );
    }
  }

  if (!serverKey) {
    fail(
      "Publishable key can ping the project, but cannot read or write the corpus (RLS).",
      "Add SUPABASE_SECRET_KEY from Project Settings → API → Secret keys, then re-run this check.",
    );
  }

  const kind = keyKind(serverKey);
  if (kind === "publishable" || kind === "anon") {
    fail(
      `Server key is ${kind}, not a secret/service_role key.`,
      "Use the secret key. Do not copy the publishable key into SUPABASE_SECRET_KEY.",
    );
  }
  console.log(`OK    server key present (${kind})`);

  const client = createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let documents;
  try {
    documents = await inspectCorpus(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingTable(message)) {
      fail(
        "Connected, but the documents table is missing.",
        "Apply supabase/migrations/20260913120000_init.sql in the Supabase SQL editor, then re-run this check.",
      );
    }
    if (isRlsDenied(message)) {
      fail(
        "Connected, but RLS blocked the corpus tables.",
        "The server key is not the secret/service_role key.",
      );
    }
    fail(message, "Check the project URL, secret key, and that the project is not paused.");
  }

  if (documents === 0) {
    console.log("NEXT  corpus is empty. Push the seed:");
    console.log("      docker compose run --rm app npm run push:supabase");
    return;
  }
  console.log("NEXT  restart the app to use Supabase locally:");
  console.log("      docker compose down && docker compose up");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
