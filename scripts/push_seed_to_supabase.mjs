#!/usr/bin/env node
/* Copy the seeded SQLite corpus into Supabase. Runtime tables stay empty. */
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvLocal, ROOT } from "./load_env_local.mjs";

loadEnvLocal();

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const sqliteVec = require("sqlite-vec");

const DB_PATH = path.join(ROOT, "data", "seed", "secure-rag.sqlite");
const BATCH = 80;

function env(name) {
  const value = process.env[name]?.trim();
  return value || "";
}

function floats(embedding) {
  if (Array.isArray(embedding)) return embedding;
  const bytes = embedding instanceof Uint8Array ? embedding : new Uint8Array(embedding);
  return Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4)));
}

async function insertAll(client, table, rows) {
  for (let index = 0; index < rows.length; index += BATCH) {
    const slice = rows.slice(index, index + BATCH);
    const { error } = await client.from(table).upsert(slice);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function main() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL");
  const key = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) before pushing the corpus. The publishable key cannot write through RLS.",
    );
  }
  const db = new Database(DB_PATH, { readonly: true });
  sqliteVec.load(db);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const documents = db.prepare("SELECT * FROM documents").all();
  const metadata = db.prepare("SELECT * FROM document_metadata").all();
  const runs = db.prepare("SELECT * FROM ingestion_runs").all();
  const chunks = db.prepare("SELECT * FROM chunks").all();
  const embeddings = db.prepare("SELECT * FROM chunk_embeddings").all();
  const vectors = new Map(db.prepare("SELECT rowid, embedding FROM chunk_vectors").all().map((row) => [Number(row.rowid), floats(row.embedding)]));

  await insertAll(client, "documents", documents);
  await insertAll(client, "document_metadata", metadata.map((row) => ({
    ...row,
    tags_json: JSON.parse(row.tags_json),
    adversarial_fixture: Number(row.adversarial_fixture) === 1,
  })));
  await insertAll(client, "ingestion_runs", runs);
  await insertAll(client, "chunks", chunks);
  await insertAll(client, "chunk_embeddings", embeddings.map((row) => ({
    ...row,
    embedding: vectors.get(Number(row.chunk_id)) ?? null,
  })));

  const manifest = JSON.parse(readFileSync(path.join(ROOT, "data", "seed", "manifest.json"), "utf8"));
  console.log(`Pushed ${documents.length} documents and ${chunks.length} chunks (${manifest.corpusVersion}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
