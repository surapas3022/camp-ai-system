#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const sqliteVec = require("sqlite-vec");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED_DIR = path.join(ROOT, "data", "seed");
const SOURCE_DIR = path.join(SEED_DIR, "source-files");
const DB_PATH = path.join(SEED_DIR, "secure-rag.sqlite");
const MANIFEST_PATH = path.join(SEED_DIR, "manifest.json");
const EVALUATION_PATH = path.join(SEED_DIR, "evaluation-queries.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  assert(existsSync(DB_PATH), "Missing seed database. Run generate:secure-corpus first.");
  assert(existsSync(MANIFEST_PATH), "Missing seed manifest.");
  assert(existsSync(EVALUATION_PATH), "Missing evaluation queries.");
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const evaluation = JSON.parse(readFileSync(EVALUATION_PATH, "utf8"));
  const db = new Database(DB_PATH, { readonly: true });
  sqliteVec.load(db);
  const scalar = (sql) => Number(db.prepare(sql).get().count);
  const documentCount = scalar("SELECT COUNT(*) AS count FROM documents");
  const chunkCount = scalar("SELECT COUNT(*) AS count FROM chunks");
  const vectorCount = scalar("SELECT COUNT(*) AS count FROM chunk_vectors");
  const pageCount = scalar("SELECT COALESCE(SUM(page_count), 0) AS count FROM documents");
  assert(documentCount === manifest.documentCount, "Manifest document count does not match SQLite.");
  assert(chunkCount === manifest.chunkCount, "Manifest chunk count does not match SQLite.");
  assert(vectorCount === manifest.vectorCount && vectorCount === chunkCount, "Every chunk must have one vector.");
  assert(pageCount === manifest.pageCount, "Manifest page count does not match SQLite.");
  assert(manifest.embeddingDimensions === 384, "Corpus must use 384-dimensional E5 embeddings.");
  assert(manifest.sourceFiles.length === documentCount, "Every document needs a source file manifest entry.");
  for (const item of manifest.sourceFiles) {
    const source = path.join(SOURCE_DIR, item.sourceFilename);
    assert(existsSync(source), `Missing source PDF: ${item.sourceFilename}`);
    assert(statSync(source).size > 1_000, `Source PDF is unexpectedly small: ${item.sourceFilename}`);
    assert(readFileSync(source).subarray(0, 4).toString("ascii") === "%PDF", `Source is not a PDF: ${item.sourceFilename}`);
  }
  const badMetadata = scalar("SELECT COUNT(*) AS count FROM document_metadata WHERE access_level NOT IN ('public', 'staff') OR title = '' OR owner = ''");
  assert(badMetadata === 0, "Every document requires complete public/staff metadata.");
  const fixtures = scalar("SELECT COUNT(*) AS count FROM document_metadata WHERE adversarial_fixture = 1");
  assert(fixtures === manifest.adversarialFixtureCount && fixtures >= 5, "Expected five labelled adversarial fixtures.");
  const publicOverlap = scalar("SELECT COUNT(*) AS count FROM document_metadata WHERE access_level = 'public' AND tags_json LIKE '%assessment%'");
  const staffOverlap = scalar("SELECT COUNT(*) AS count FROM document_metadata WHERE access_level = 'staff' AND tags_json LIKE '%assessment%'");
  assert(publicOverlap > 0 && staffOverlap > 0, "Expected public/staff topic overlap for access-boundary testing.");
  const keyword = db.prepare("SELECT c.document_id FROM chunk_search s JOIN chunks c ON c.id = s.rowid WHERE chunk_search MATCH ? LIMIT 1").get('"assessment"');
  assert(keyword, "Keyword index did not return a representative result.");
  const representativeVector = db.prepare("SELECT rowid, embedding FROM chunk_vectors LIMIT 1").get();
  const semantic = db.prepare("SELECT rowid, distance FROM chunk_vectors WHERE embedding MATCH ? AND k = 3").all(representativeVector.embedding);
  assert(semantic.length === 3 && semantic[0].rowid === representativeVector.rowid && semantic[0].distance === 0, "Semantic SQLite-vec retrieval did not return the expected nearest vector.");
  assert(Array.isArray(evaluation) && evaluation.length >= 20, "Expected at least 20 evaluation queries.");
  const suspicious = db.prepare("SELECT COUNT(*) AS count FROM chunks WHERE text LIKE '%@%' OR text LIKE '%BEGIN PRIVATE KEY%'").get().count;
  assert(Number(suspicious) === 0, "Seed corpus must not contain email-like values or secret markers.");
  db.close();
  console.log(JSON.stringify({ verified: true, documentCount, pageCount, chunkCount, vectorCount, fixtures, evaluationQueries: evaluation.length, semanticRetrieval: "passed" }, null, 2));
}

main();
