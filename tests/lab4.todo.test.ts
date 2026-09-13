import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { POST as postFeedback } from "../app/api/feedback/route";
import { GET as getEvaluation } from "../app/api/system/evaluation/route";
import { SeedCorpusService } from "../lib/corpus/service";
import {
  buildDashboard, evaluateGate, loadEvaluationDataset, runEvaluationSuite,
} from "../lib/evaluation";
import { estimateCostUsd, loadRateCard, readProviderUsage } from "../lib/cost";
import { newFeedbackRecord, parseFeedbackRequest } from "../lib/feedback";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function temporaryRuntime(t: { after: (callback: () => unknown) => void }) {
  const runtimeDir = await mkdtemp(path.join(tmpdir(), "lab4-eval-"));
  t.after(() => rm(runtimeDir, { recursive: true, force: true }));
  return runtimeDir;
}

test("the evaluation set is versioned and every case declares an expected outcome", () => {
  const dataset = loadEvaluationDataset(projectRoot);
  assert.equal(dataset.version, "eval-v1");
  assert.equal(dataset.cases.length, 12);
  const kinds = new Set(dataset.cases.map((item) => item.kind));
  for (const kind of ["supported", "ambiguous", "unsafe", "no-evidence", "approval"] as const) assert.ok(kinds.has(kind), kind);
  const groups = new Set(dataset.cases.map((item) => item.group));
  assert.equal(groups.size, 8);
  for (const item of dataset.cases) {
    assert.ok(item.id);
    assert.ok(item.group);
    assert.ok(item.expectedOutcome);
    assert.equal(typeof item.citationSupport, "boolean");
    assert.equal(typeof item.safeStop, "boolean");
    assert.ok(item.releaseImpact === "block" || item.releaseImpact === "observe");
  }
});

test("the dated rate card estimates cost from usage tokens or stays unavailable", () => {
  const card = loadRateCard(projectRoot);
  assert.equal(card.asOf, "2026-09-13");
  assert.equal(readProviderUsage({}), null);
  const usage = readProviderUsage({ usage: { prompt_tokens: 1_000_000, completion_tokens: 500_000 } });
  assert.ok(usage);
  assert.equal(estimateCostUsd(usage, card), 0.5);
});

test("citation support and safe-stop results are measured for each evaluation case", async (t) => {
  const service = new SeedCorpusService({ projectRoot, runtimeDir: await temporaryRuntime(t) });
  t.after(() => service.close());
  const run = await runEvaluationSuite({ mode: "fixture", projectRoot, service, secret: "test-secret" });
  assert.equal(run.datasetVersion, "eval-v1");
  assert.equal(run.results.length, loadEvaluationDataset(projectRoot).cases.length);
  for (const result of run.results) {
    assert.equal(typeof result.citationSupport, "boolean");
    assert.equal(typeof result.safeStop, "boolean");
    assert.equal(typeof result.accessIsolation, "boolean");
    assert.ok(Number.isInteger(result.latencyMs));
    assert.ok(Number.isInteger(result.attemptCount));
    assert.ok(Number.isInteger(result.retryCount));
    assert.ok(Array.isArray(result.citationFingerprints));
    assert.ok(result.role === "public" || result.role === "staff");
    assert.ok(result.evaluatorLabel);
    assert.ok(result.rateCardAsOf);
  }
  const supported = run.results.filter((result) => result.kind === "supported");
  assert.ok(supported.every((result) => result.citationSupport));
  assert.ok(supported.every((result) => result.citationFingerprints.length > 0));
  const stops = run.results.filter((result) => result.kind === "unsafe" || result.kind === "no-evidence");
  assert.ok(stops.every((result) => result.safeStop));
  assert.ok(stops.every((result) => result.reasonCode));
  const publicIsolation = run.results.filter((result) => result.role === "public");
  assert.ok(publicIsolation.every((result) => result.accessIsolation));
  const staffCase = run.results.find((result) => result.caseId === "access-staff-staff-procedure");
  assert.ok(staffCase);
  assert.equal(staffCase.role, "staff");
  assert.equal(staffCase.accessIsolation, true);
  assert.equal(run.gate.status, "pass", JSON.stringify(run.results.filter((result) => !result.passed), null, 2));
  assert.equal(run.gate.groups.length, 8);
  assert.ok(run.gate.groups.every((group) => group.status === "pass"));
  assert.equal(run.metrics.costStatus, "unavailable");
  assert.equal(run.metrics.rateCardAsOf, "2026-09-13");
  assert.ok(run.metrics.retryCountTotal >= 1);
  const schema = run.results.find((result) => result.caseId === "citation-schema-rejection");
  assert.ok(schema);
  assert.equal(schema.actualOutcome, "unsafe_output");
  assert.equal(schema.errorClass, "validation");
  const poisoned = run.results.find((result) => result.caseId === "poisoned-answer-migration");
  assert.ok(poisoned);
  assert.equal(poisoned.safeStop, true);
  assert.equal(poisoned.reasonCode, "indirect_prompt_injection");
});

test("evaluation records exclude raw prompts, drafts, evidence text, and personal data", async (t) => {
  const service = new SeedCorpusService({ projectRoot, runtimeDir: await temporaryRuntime(t) });
  t.after(() => service.close());
  const dataset = loadEvaluationDataset(projectRoot);
  const run = await runEvaluationSuite({ mode: "fixture", projectRoot, service, secret: "test-secret" });
  const dashboard = await buildDashboard(service, projectRoot);
  const stored = JSON.stringify({ run: service.latestEvaluationRun(), dashboard, events: service.listOperationalEvents(200) });
  for (const item of dataset.cases) assert.equal(stored.includes(item.prompt), false, item.id);
  assert.equal(stored.includes("learner@example.test"), false);
  assert.equal(stored.includes("Grounded fixture response."), false);
  assert.equal(stored.includes("Draft for review"), false);
  assert.equal(JSON.stringify(dashboard.cases).includes("prompt"), false);
});

test("a provider or quota failure selects only the approved fallback or safe-error path", async (t) => {
  const service = new SeedCorpusService({ projectRoot, runtimeDir: await temporaryRuntime(t) });
  t.after(() => service.close());
  const run = await runEvaluationSuite({ mode: "fixture", projectRoot, service, secret: "test-secret" });
  const failure = run.results.find((result) => result.caseId === "provider-failure");
  assert.ok(failure);
  assert.equal(failure.actualOutcome, "unsafe_output");
  assert.equal(failure.errorClass, "provider");
  assert.ok(failure.retryCount >= 1);
  assert.ok(failure.attemptCount >= 2);
  assert.equal(failure.citationSupport, false);
  assert.equal(failure.passed, true);
  assert.equal(JSON.stringify(failure).includes("Grounded fixture response."), false);
});

test("feedback payloads are validated, bounded, and privacy-minimised", async (t) => {
  assert.throws(() => parseFeedbackRequest({ kind: "quality", rating: "up", reasonCodes: [], surface: "system", comment: "raw text" }), /unknown or missing/u);
  assert.throws(() => parseFeedbackRequest({ kind: "quality", rating: "up", reasonCodes: ["not-a-code"], surface: "system" }), /allowlisted/u);
  assert.throws(() => parseFeedbackRequest({ kind: "quality", rating: "up", reasonCodes: ["inaccurate", "unhelpful", "good_quality", "unsafe_output"], surface: "system" }), /at most three/u);
  const parsed = parseFeedbackRequest({ kind: "safety", rating: "down", reasonCodes: ["missed_refusal"], surface: "system" });
  const record = newFeedbackRecord("test-secret", parsed, "public");
  assert.equal(record.kind, "safety");
  assert.equal(JSON.stringify(record).includes("missed_refusal"), true);
  assert.ok(record.payloadFingerprint);
  assert.equal("comment" in record, false);

  const service = new SeedCorpusService({ projectRoot, runtimeDir: await temporaryRuntime(t) });
  t.after(() => service.close());
  service.recordFeedback(record);
  const stored = JSON.stringify(service.listFeedback(10));
  assert.equal(stored.includes("raw text"), false);
  assert.equal(stored.includes("learner@example.test"), false);

  const rejected = await postFeedback(new Request("http://localhost/api/feedback", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "quality", rating: "up", reasonCodes: [], surface: "system", note: "please store this" }),
  }));
  assert.equal(rejected.status, 400);
});

test("release criteria block release when a required evaluation case fails", async (t) => {
  const service = new SeedCorpusService({ projectRoot, runtimeDir: await temporaryRuntime(t) });
  t.after(() => service.close());
  const run = await runEvaluationSuite({ mode: "fixture", projectRoot, service, secret: "test-secret" });
  assert.equal(run.gate.status, "pass");
  const blocked = evaluateGate(run.results.map((result, index) => index === 0 ? { ...result, passed: false, citationSupport: false } : result));
  assert.equal(blocked.status, "fail");
  assert.ok(blocked.blockingFailures.includes(run.results[0]?.caseId ?? ""));
  assert.ok(blocked.reasons.includes("blocking_case_failed"));
  assert.ok(blocked.reasons.includes("citation_support_below_threshold"));
  assert.ok(blocked.reasons.includes("gate_group_failed"));
  const isolated = evaluateGate(run.results.map((result) => result.role === "public" ? { ...result, passed: false, accessIsolation: false } : result));
  assert.equal(isolated.status, "fail");
  assert.ok(isolated.reasons.includes("access_isolation_failed"));
});

test.skip("a release decision records its evidence and a documented limitation");

test("evaluation dashboard routes require a staff session", async () => {
  const denied = await getEvaluation(new Request("http://localhost/api/system/evaluation"));
  assert.equal(denied.status, 403);
});
