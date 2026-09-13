import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createStaffSession, isAuthorized, resolveSession, verifyStaffPin } from "../lib/auth";
import { SeedCorpusService } from "../lib/corpus/service";
import { GET as getDocuments } from "../app/api/knowledge/documents/route";
import { GET as getDocument } from "../app/api/knowledge/documents/[id]/route";
import { GET as getSourceFile } from "../app/api/knowledge/documents/[id]/file/route";
import { DELETE as logout, POST as staffLogin } from "../app/api/session/route";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionEnv = { SESSION_SECRET: "test-session-secret-that-is-long-and-unique", STAFF_PIN_SCRYPT_HASH: staffPinHash("2468") };

function staffPinHash(pin: string) {
  const N = 16_384; const r = 8; const p = 1; const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

async function temporaryRuntime(t: { after: (callback: () => unknown) => void }) {
  const runtimeDir = await mkdtemp(path.join(tmpdir(), "secure-rag-rbac-"));
  t.after(() => rm(runtimeDir, { recursive: true, force: true }));
  return runtimeDir;
}

test("scrypt staff PIN sessions are signed, expire after eight hours, and reject tampering", async () => {
  assert.equal(await verifyStaffPin("2468", sessionEnv), true);
  assert.equal(await verifyStaffPin("wrong", sessionEnv), false);
  const now = new Date("2026-09-06T00:00:00.000Z");
  const session = createStaffSession(now, sessionEnv);
  assert.equal(resolveSession(new Request("https://example.test", { headers: { cookie: `secure_rag_staff_session=${session.token}` } }), now, sessionEnv).role, "staff");
  assert.equal(resolveSession(new Request("https://example.test", { headers: { cookie: `secure_rag_staff_session=${session.token}x` } }), now, sessionEnv).role, "public");
  assert.equal(resolveSession(new Request("https://example.test", { headers: { cookie: `secure_rag_staff_session=${createStaffSession(new Date(0), sessionEnv).token}` } }), now, sessionEnv).role, "public");
});

test("public document and retrieval paths exclude staff classifications", async (t) => {
  const service = new SeedCorpusService({ projectRoot, runtimeDir: await temporaryRuntime(t) });
  t.after(() => service.close());
  const publicDocuments = service.listDocuments("public");
  const staffDocuments = service.listDocuments("staff");
  assert.ok(publicDocuments.length < staffDocuments.length);
  assert.ok(publicDocuments.every((document) => document.accessLevel === "public"));
  assert.equal(staffDocuments.length, service.manifest.documentCount);
  assert.ok(service.searchKeyword("assessment", 20, "public").every((chunk) => chunk.accessLevel === "public"));
  assert.ok(service.searchSemanticWithStoredVector(10, "public").every((chunk) => chunk.accessLevel === "public"));
  assert.equal(isAuthorized("public", "staff"), false);
  assert.equal(isAuthorized("staff", "staff"), true);
});

test("session and inspection routes enforce the same role boundary", async () => {
  const previousSecret = process.env.SESSION_SECRET;
  const previousHash = process.env.STAFF_PIN_SCRYPT_HASH;
  process.env.SESSION_SECRET = sessionEnv.SESSION_SECRET;
  process.env.STAFF_PIN_SCRYPT_HASH = sessionEnv.STAFF_PIN_SCRYPT_HASH;
  try {
    const login = await staffLogin(new Request("http://localhost/api/session", { method: "POST", body: JSON.stringify({ pin: "2468" }), headers: { "content-type": "application/json" } }));
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie");
    assert.ok(setCookie?.includes("HttpOnly"));
    assert.ok(setCookie?.includes("SameSite=Lax"));
    const cookie = setCookie?.split(";")[0] ?? "";

    const publicLedger = await getDocuments(new Request("http://localhost/api/knowledge/documents"));
    const publicDocuments = await publicLedger.json() as { documents: Array<{ accessLevel: string }> };
    assert.ok(publicDocuments.documents.every((document) => document.accessLevel === "public"));

    const service = new SeedCorpusService({ projectRoot });
    const protectedId = service.listDocuments("staff").find((document) => document.accessLevel === "staff")?.id;
    service.close();
    assert.ok(protectedId);
    const context = { params: Promise.resolve({ id: protectedId }) };
    assert.equal((await getDocument(new Request(`http://localhost/api/knowledge/documents/${protectedId}`), context)).status, 403);
    const deniedPdf = await getSourceFile(new Request(`http://localhost/api/knowledge/documents/${protectedId}/file`), context);
    assert.equal(deniedPdf.status, 403);
    assert.match(deniedPdf.headers.get("content-type") ?? "", /text\/html/u);
    assert.match(await deniedPdf.text(), /Access denied/u);
    assert.equal((await getDocument(new Request(`http://localhost/api/knowledge/documents/${protectedId}`, { headers: { cookie } }), context)).status, 200);
    assert.equal((await logout()).headers.get("set-cookie")?.includes("Max-Age=0"), true);
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previousSecret;
    if (previousHash === undefined) delete process.env.STAFF_PIN_SCRYPT_HASH; else process.env.STAFF_PIN_SCRYPT_HASH = previousHash;
  }
});
