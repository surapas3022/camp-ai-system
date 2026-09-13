import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { streamAnswer } from "../lib/answer";
import { bootstrapSeed } from "../lib/corpus/bootstrap";
import { SeedCorpusService } from "../lib/corpus/service";
import type { RetrievedChunk } from "../lib/corpus/types";
import { toCitation } from "../lib/rag";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function temporaryRuntime(t: { after: (callback: () => unknown) => void }) {
  const runtimeDir = await mkdtemp(path.join(tmpdir(), "secure-rag-v0-"));
  t.after(() => rm(runtimeDir, { recursive: true, force: true }));
  return runtimeDir;
}

function retrieved(): RetrievedChunk {
  return {
    id: 7, ordinal: 1, documentId: "doc-1", documentName: "Seed guide", accessLevel: "public",
    text: "Learner data must be protected.", pageStart: 4, pageEnd: 4, tokenCount: 6,
    embeddingModel: "intfloat/multilingual-e5-small", embeddingRuntime: "Xenova/multilingual-e5-small", embeddingDimensions: 384, embeddedAt: "2026-09-05T00:00:00.000Z", score: 0.2,
  };
}

test("copies the immutable seeded database and source PDFs on first run", async (t) => {
  const runtimeDir = await temporaryRuntime(t);
  const paths = bootstrapSeed({ projectRoot, runtimeDir });
  assert.equal(statSync(paths.databasePath).size, statSync(path.join(projectRoot, "data/seed/secure-rag.sqlite")).size);
  assert.equal(existsSync(path.join(paths.sourceDir, "student-genai-support-faq.pdf")), true);
  assert.equal(statSync(path.join(paths.sourceDir, "student-genai-support-faq.pdf")).size > 1_000, true);
  const originalSize = statSync(paths.databasePath).size;
  assert.equal(bootstrapSeed({ projectRoot, runtimeDir }).databasePath, paths.databasePath);
  assert.equal(statSync(paths.databasePath).size, originalSize);
});

test("seed manifest, database records, and copied source files remain consistent", async (t) => {
  const runtimeDir = await temporaryRuntime(t);
  const service = new SeedCorpusService({ projectRoot, runtimeDir });
  t.after(() => service.close());
  const documents = service.listDocuments("staff");
  assert.equal(documents.length, service.manifest.documentCount);
  assert.equal(documents.reduce((total, document) => total + document.chunkCount, 0), service.manifest.chunkCount);
  for (const document of documents) {
    const manifest = service.manifest.sourceFiles.find((item) => item.id === document.id);
    assert.ok(manifest);
    assert.equal(document.accessLevel, manifest.classification);
    assert.equal(document.pageCount, manifest.pageCount);
    assert.equal(document.chunkCount, manifest.chunkCount);
    const source = service.getSourceFile(document.id);
    assert.ok(source);
    assert.equal(source.filename, manifest.sourceFilename);
    assert.equal((await readFile(source.path)).subarray(0, 4).toString("ascii"), "%PDF");
  }
});

test("keyword retrieval searches the seeded FTS5 index", async (t) => {
  const service = new SeedCorpusService({ projectRoot, runtimeDir: await temporaryRuntime(t) });
  t.after(() => service.close());
  const results = service.searchKeyword("assessment", 10);
  assert.ok(results.length > 0);
  assert.ok(results.every((result) => result.documentName && (result.accessLevel === "public" || result.accessLevel === "staff")));
});

test("semantic retrieval searches the seeded SQLite-vec index", async (t) => {
  const service = new SeedCorpusService({ projectRoot, runtimeDir: await temporaryRuntime(t) });
  t.after(() => service.close());
  const results = service.searchSemanticWithStoredVector(3);
  assert.equal(results.length, 3);
  assert.equal(results[0]?.id, 1);
  assert.equal(results[0]?.score, 0);
});

test("validates a structured NVIDIA-compatible answer against authorized citations", async () => {
  let request: Request | undefined;
  const events = [] as Array<{ event: string; data: unknown }>;
  for await (const event of streamAnswer({ question: "How should data be handled?", mode: "semantic", language: "en", role: "public" }, {
    config: { baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: "test-key", model: "nvidia/test" },
    fetchImpl: async (input, init) => {
      request = new Request(input, init);
      const requestBody = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const fingerprint = /citation_fingerprint="([^"]+)"/u.exec(requestBody.messages[1].content)?.[1];
      return Response.json({ choices: [{ message: { content: JSON.stringify({ status: "grounded", answer: "Learner data must be protected.", citationFingerprints: [fingerprint] }) } }] });
    },
    retrieveImpl: async () => ({ chunks: [retrieved()] }),
  })) events.push(event);
  assert.equal(request?.url, "https://integrate.api.nvidia.com/v1/chat/completions");
  assert.equal(request?.headers.get("authorization"), "Bearer test-key");
  const payload = await request?.json() as { model: string; stream: boolean; response_format: { type: string }; messages: unknown[] };
  assert.equal(payload.model, "nvidia/test");
  assert.equal(payload.stream, false);
  assert.equal(payload.response_format.type, "json_object");
  assert.equal(payload.messages.length, 2);
  const final = events.at(-1)?.data as { status: string; answer: string; citations: Array<{ chunkId: string }> };
  assert.equal(final.status, "grounded");
  assert.equal(final.answer, "Learner data must be protected.");
  assert.deepEqual(final.citations.map((citation) => citation.chunkId), ["7"]);
});

test("does not invoke NVIDIA Build when retrieval returns no evidence", async () => {
  let called = false;
  const events = [] as Array<{ event: string; data: unknown }>;
  for await (const event of streamAnswer({ question: "Unknown topic", mode: "keyword", language: "en", role: "public" }, {
    fetchImpl: async () => { called = true; return new Response(); }, retrieveImpl: async () => ({ chunks: [] }),
  })) events.push(event);
  assert.equal(called, false);
  assert.equal(events.at(-1)?.data && (events.at(-1)?.data as { status: string }).status, "not_found");
});

test("page citations resolve to the matching seeded source PDF", async (t) => {
  const service = new SeedCorpusService({ projectRoot, runtimeDir: await temporaryRuntime(t) });
  t.after(() => service.close());
  const document = service.getDocument("student-genai-support-faq");
  assert.ok(document);
  const chunk = document.chunks[0];
  const citation = toCitation({ ...chunk, documentName: document.title, accessLevel: document.accessLevel, score: 0 }, 1);
  const source = service.getSourceFile(citation.documentId);
  assert.ok(source);
  assert.equal(source.filename, document.originalFilename);
  assert.equal(citation.pageStart, 1);
  assert.equal(citation.pageEnd <= document.pageCount, true);
});
