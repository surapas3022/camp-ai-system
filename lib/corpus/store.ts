import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type {
  AccessLevel, EvaluationRun, FeedbackRecord, OperationalEvent, TaskSummary, TraceEvent, UserRole,
} from "../contracts";
import type { AuditRecord, SecurityRepository } from "../security";
import type { DocumentChunk, DocumentDetail, DocumentSummary, RetrievedChunk } from "./types";

const MAX_EVALUATION_RUNS = 10;
const MAX_OPERATIONAL_EVENTS = 200;
const MAX_FEEDBACK_RECORDS = 100;

export class SeedCorpusStore implements SecurityRepository {
  private readonly database: Database.Database;

  constructor(databasePath: string) {
    this.database = new Database(databasePath);
    this.database.pragma("foreign_keys = ON");
    sqliteVec.load(this.database);
    this.ensureSecuritySchema();
  }

  close() { this.database.close(); }

  listDocuments(role: UserRole): DocumentSummary[] {
    const rows = this.database.prepare(`${documentSelect()} WHERE ${accessClause()} ORDER BY d.id`).all(role) as Array<Record<string, unknown>>;
    return rows.map(toSummary);
  }

  getDocument(id: string): DocumentDetail | null {
    const row = this.database.prepare(`${documentSelect()} WHERE d.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const chunks = this.database.prepare(`
      SELECT c.id, c.ordinal, c.document_id, c.text, c.page_start, c.page_end, c.token_count,
        e.model_id, e.runtime_model_id, e.dimensions, e.embedded_at
      FROM chunks c JOIN chunk_embeddings e ON e.chunk_id = c.id
      WHERE c.document_id = ? ORDER BY c.ordinal
    `).all(id) as Array<Record<string, unknown>>;
    return { ...toSummary(row), chunks: chunks.map(toChunk) };
  }

  getSourceFilename(id: string): string | null {
    const row = this.database.prepare("SELECT stored_filename FROM documents WHERE id = ?").get(id) as { stored_filename: string } | undefined;
    return row?.stored_filename ?? null;
  }

  searchKeyword(text: string, limit: number, role: UserRole): RetrievedChunk[] {
    const match = toTrigramMatch(text);
    if (!match) return [];
    const rows = this.database.prepare(`
      SELECT c.id, c.ordinal, c.document_id, c.text, c.page_start, c.page_end, c.token_count,
        e.model_id, e.runtime_model_id, e.dimensions, e.embedded_at,
        m.title, m.access_level, bm25(chunk_search) AS score
      FROM chunk_search
      JOIN chunks c ON c.id = chunk_search.rowid
      JOIN documents d ON d.id = c.document_id
      JOIN document_metadata m ON m.document_id = d.id
      JOIN chunk_embeddings e ON e.chunk_id = c.id
      WHERE chunk_search MATCH ? AND d.status = 'ready' AND ${accessClause()} AND ${notQuarantinedClause()}
      ORDER BY score ASC LIMIT ?
    `).all(match, role, limit) as Array<Record<string, unknown>>;
    return rows.map(toRetrievedChunk);
  }

  searchSemantic(embedding: string | Uint8Array, limit: number, role: UserRole): RetrievedChunk[] {
    const rows = this.database.prepare(`
      SELECT c.id, c.ordinal, c.document_id, c.text, c.page_start, c.page_end, c.token_count,
        e.model_id, e.runtime_model_id, e.dimensions, e.embedded_at,
        m.title, m.access_level, v.distance AS score
      FROM chunk_vectors v
      JOIN chunks c ON c.id = v.rowid
      JOIN documents d ON d.id = c.document_id
      JOIN document_metadata m ON m.document_id = d.id
      JOIN chunk_embeddings e ON e.chunk_id = c.id
      WHERE v.embedding MATCH ? AND k = ? AND d.status = 'ready' AND ${accessClause()} AND ${notQuarantinedClause()}
      ORDER BY v.distance ASC
    `).all(embedding, limit, role) as Array<Record<string, unknown>>;
    return rows.map(toRetrievedChunk);
  }

  firstStoredVector(): Uint8Array {
    const row = this.database.prepare("SELECT embedding FROM chunk_vectors LIMIT 1").get() as { embedding?: Uint8Array } | undefined;
    if (!row?.embedding) throw new Error("Seed corpus has no vectors.");
    return row.embedding;
  }

  quarantineChunk(input: { chunkId: number; reasonCode: string; detectorVersion: string; contentFingerprint: string }): boolean {
    const result = this.database.prepare(`
      INSERT INTO security_chunk_flags (chunk_id, status, reason_code, detector_version, content_fingerprint, detected_at)
      VALUES (?, 'quarantined', ?, ?, ?, ?)
      ON CONFLICT(chunk_id) DO NOTHING
    `).run(input.chunkId, input.reasonCode, input.detectorVersion, input.contentFingerprint, new Date().toISOString());
    return result.changes === 1;
  }

  recordAudit(event: AuditRecord): void {
    this.database.prepare(`
      INSERT INTO audit_events (
        id, created_at, request_fingerprint, answer_fingerprint, role, retrieval_mode, language,
        decision, reason_codes_json, authorized_chunk_count, citation_chunk_ids_json, incident_found
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id, event.createdAt, event.requestFingerprint, event.answerFingerprint, event.role, event.mode, event.language,
      event.decision, JSON.stringify(event.reasonCodes), event.authorizedChunkCount, JSON.stringify(event.citationChunkIds), event.incidentFound ? 1 : 0,
    );
  }

  listAuditEvents(limit: number): AuditRecord[] {
    const rows = this.database.prepare(`
      SELECT id, created_at, request_fingerprint, answer_fingerprint, role, retrieval_mode, language,
        decision, reason_codes_json, authorized_chunk_count, citation_chunk_ids_json, incident_found
      FROM audit_events ORDER BY created_at DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id), createdAt: String(row.created_at), requestFingerprint: String(row.request_fingerprint),
      answerFingerprint: row.answer_fingerprint == null ? null : String(row.answer_fingerprint), role: String(row.role) as UserRole,
      mode: String(row.retrieval_mode) as AuditRecord["mode"], language: String(row.language) as AuditRecord["language"],
      decision: String(row.decision) as AuditRecord["decision"], reasonCodes: JSON.parse(String(row.reason_codes_json)) as string[],
      authorizedChunkCount: Number(row.authorized_chunk_count), citationChunkIds: JSON.parse(String(row.citation_chunk_ids_json)) as string[],
      incidentFound: Number(row.incident_found) === 1,
    }));
  }

  recordAgentTask(summary: TaskSummary): void {
    this.database.prepare(`
      INSERT INTO agent_task_summaries (
        task_id, created_at, updated_at, role, state, task_fingerprint, evidence_count,
        draft_version, approval_json, reason_codes_json, step_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        updated_at = excluded.updated_at, state = excluded.state, evidence_count = excluded.evidence_count,
        draft_version = excluded.draft_version, approval_json = excluded.approval_json,
        reason_codes_json = excluded.reason_codes_json, step_count = excluded.step_count
    `).run(
      summary.taskId, summary.createdAt, summary.updatedAt, summary.role, summary.state, summary.taskFingerprint,
      summary.evidenceCount, summary.draftVersion, JSON.stringify(summary.approval), JSON.stringify(summary.reasonCodes), summary.stepCount,
    );
  }

  recordAgentTrace(event: TraceEvent): void {
    this.database.prepare(`
      INSERT INTO agent_trace_events (
        id, task_id, created_at, from_state, to_state, tool, outcome, evidence_count,
        draft_version, reason_code, step
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id, event.taskId, event.createdAt, event.fromState, event.toState, event.tool, event.outcome,
      event.evidenceCount, event.draftVersion, event.reasonCode, event.step,
    );
  }

  recordOperationalEvent(event: OperationalEvent): void {
    this.database.prepare(`
      INSERT INTO operational_events (
        id, created_at, kind, outcome, latency_ms, error_class, citation_count, estimated_cost_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id, event.createdAt, event.kind, event.outcome, event.latencyMs, event.errorClass,
      event.citationCount, event.estimatedCostUsd,
    );
    this.pruneOldest("operational_events", MAX_OPERATIONAL_EVENTS);
  }

  listOperationalEvents(limit: number): OperationalEvent[] {
    const rows = this.database.prepare(`
      SELECT id, created_at, kind, outcome, latency_ms, error_class, citation_count, estimated_cost_usd
      FROM operational_events ORDER BY created_at DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      kind: String(row.kind) as OperationalEvent["kind"],
      outcome: String(row.outcome),
      latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
      errorClass: String(row.error_class) as OperationalEvent["errorClass"],
      citationCount: Number(row.citation_count),
      estimatedCostUsd: row.estimated_cost_usd == null ? null : Number(row.estimated_cost_usd),
    }));
  }

  recordEvaluationRun(run: EvaluationRun): void {
    this.database.prepare(`
      INSERT INTO evaluation_runs (id, created_at, dataset_version, mode, results_json, metrics_json, gate_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id, run.createdAt, run.datasetVersion, run.mode,
      JSON.stringify(run.results), JSON.stringify(run.metrics), JSON.stringify(run.gate),
    );
    this.pruneOldest("evaluation_runs", MAX_EVALUATION_RUNS);
  }

  latestEvaluationRun(): EvaluationRun | null {
    const row = this.database.prepare(`
      SELECT id, created_at, dataset_version, mode, results_json, metrics_json, gate_json
      FROM evaluation_runs ORDER BY created_at DESC LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    return row ? toEvaluationRun(row) : null;
  }

  recordFeedback(record: FeedbackRecord): void {
    this.database.prepare(`
      INSERT INTO feedback_events (
        id, created_at, role, kind, rating, reason_codes_json, surface, payload_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.createdAt, record.role, record.kind, record.rating,
      JSON.stringify(record.reasonCodes), record.surface, record.payloadFingerprint,
    );
    this.pruneOldest("feedback_events", MAX_FEEDBACK_RECORDS);
  }

  listFeedback(limit: number): FeedbackRecord[] {
    const rows = this.database.prepare(`
      SELECT id, created_at, role, kind, rating, reason_codes_json, surface, payload_fingerprint
      FROM feedback_events ORDER BY created_at DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      role: String(row.role) as UserRole,
      kind: String(row.kind) as FeedbackRecord["kind"],
      rating: String(row.rating) as FeedbackRecord["rating"],
      reasonCodes: JSON.parse(String(row.reason_codes_json)) as string[],
      surface: String(row.surface) as FeedbackRecord["surface"],
      payloadFingerprint: String(row.payload_fingerprint),
    }));
  }

  private pruneOldest(table: "operational_events" | "evaluation_runs" | "feedback_events", keep: number) {
    this.database.prepare(`DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} ORDER BY created_at DESC LIMIT -1 OFFSET ?)`).run(keep);
  }

  private ensureSecuritySchema() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS security_chunk_flags (
        chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('quarantined')),
        reason_code TEXT NOT NULL,
        detector_version TEXT NOT NULL,
        content_fingerprint TEXT NOT NULL,
        detected_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS security_chunk_flags_status_idx ON security_chunk_flags(status);
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        answer_fingerprint TEXT,
        role TEXT NOT NULL CHECK(role IN ('public', 'staff')),
        retrieval_mode TEXT NOT NULL CHECK(retrieval_mode IN ('keyword', 'semantic')),
        language TEXT NOT NULL CHECK(language IN ('en', 'th')),
        decision TEXT NOT NULL CHECK(decision IN ('allow', 'refuse_input', 'refuse_pii', 'no_authorized_evidence', 'unsafe_output')),
        reason_codes_json TEXT NOT NULL,
        authorized_chunk_count INTEGER NOT NULL,
        citation_chunk_ids_json TEXT NOT NULL,
        incident_found INTEGER NOT NULL CHECK(incident_found IN (0, 1))
      );
      CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events(created_at DESC);
      CREATE TABLE IF NOT EXISTS agent_task_summaries (
        task_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('public', 'staff')),
        state TEXT NOT NULL CHECK(state IN ('planned', 'awaiting_approval', 'completed', 'declined', 'safely_stopped')),
        task_fingerprint TEXT NOT NULL,
        evidence_count INTEGER NOT NULL,
        draft_version INTEGER,
        approval_json TEXT NOT NULL,
        reason_codes_json TEXT NOT NULL,
        step_count INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_trace_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        from_state TEXT,
        to_state TEXT NOT NULL CHECK(to_state IN ('planned', 'awaiting_approval', 'completed', 'declined', 'safely_stopped')),
        tool TEXT CHECK(tool IN ('search_knowledge_base', 'create_draft', 'request_approval')),
        outcome TEXT NOT NULL CHECK(outcome IN ('ok', 'stopped', 'declined')),
        evidence_count INTEGER NOT NULL,
        draft_version INTEGER,
        reason_code TEXT,
        step INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS agent_trace_events_task_id_idx ON agent_trace_events(task_id, created_at);
      CREATE TABLE IF NOT EXISTS operational_events (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('answer', 'agent', 'evaluation', 'feedback')),
        outcome TEXT NOT NULL,
        latency_ms INTEGER,
        error_class TEXT NOT NULL CHECK(error_class IN ('none', 'provider', 'validation', 'internal')),
        citation_count INTEGER NOT NULL,
        estimated_cost_usd REAL
      );
      CREATE INDEX IF NOT EXISTS operational_events_created_at_idx ON operational_events(created_at DESC);
      CREATE TABLE IF NOT EXISTS evaluation_runs (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        dataset_version TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('fixture', 'provider')),
        results_json TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        gate_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS evaluation_runs_created_at_idx ON evaluation_runs(created_at DESC);
      CREATE TABLE IF NOT EXISTS feedback_events (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('public', 'staff')),
        kind TEXT NOT NULL CHECK(kind IN ('quality', 'safety')),
        rating TEXT NOT NULL CHECK(rating IN ('up', 'down')),
        reason_codes_json TEXT NOT NULL,
        surface TEXT NOT NULL CHECK(surface IN ('answer', 'agent', 'system')),
        payload_fingerprint TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS feedback_events_created_at_idx ON feedback_events(created_at DESC);
    `);
  }
}

function documentSelect() {
  return `
    SELECT d.id, d.original_filename, d.page_count,
      m.access_level, m.title, m.owner, m.audience, m.review_date, m.retention_category, m.tags_json,
      m.adversarial_fixture, m.fixture_type,
      (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count,
      (SELECT e.model_id FROM chunk_embeddings e JOIN chunks c ON c.id = e.chunk_id WHERE c.document_id = d.id LIMIT 1) AS model_id,
      (SELECT e.dimensions FROM chunk_embeddings e JOIN chunks c ON c.id = e.chunk_id WHERE c.document_id = d.id LIMIT 1) AS dimensions
    FROM documents d JOIN document_metadata m ON m.document_id = d.id
  `;
}

function accessClause() { return "(m.access_level = 'public' OR ? = 'staff')"; }
function notQuarantinedClause() { return "NOT EXISTS (SELECT 1 FROM security_chunk_flags sf WHERE sf.chunk_id = c.id AND sf.status = 'quarantined')"; }

function toSummary(row: Record<string, unknown>): DocumentSummary {
  return {
    id: String(row.id),
    title: String(row.title),
    originalFilename: String(row.original_filename),
    accessLevel: String(row.access_level) as AccessLevel,
    owner: String(row.owner),
    audience: String(row.audience),
    reviewDate: String(row.review_date),
    retentionCategory: String(row.retention_category),
    tags: JSON.parse(String(row.tags_json)) as string[],
    adversarialFixture: Number(row.adversarial_fixture) === 1,
    fixtureType: row.fixture_type == null ? null : String(row.fixture_type),
    pageCount: Number(row.page_count),
    chunkCount: Number(row.chunk_count),
    embeddingModel: String(row.model_id),
    embeddingDimensions: Number(row.dimensions),
  };
}

function toChunk(row: Record<string, unknown>): DocumentChunk {
  return {
    id: Number(row.id), ordinal: Number(row.ordinal), documentId: String(row.document_id), text: String(row.text),
    pageStart: Number(row.page_start), pageEnd: Number(row.page_end), tokenCount: Number(row.token_count),
    embeddingModel: String(row.model_id), embeddingRuntime: String(row.runtime_model_id),
    embeddingDimensions: Number(row.dimensions), embeddedAt: String(row.embedded_at),
  };
}

function toRetrievedChunk(row: Record<string, unknown>): RetrievedChunk {
  return {
    ...toChunk(row), documentName: String(row.title), accessLevel: String(row.access_level) as AccessLevel, score: Number(row.score),
  };
}

function toEvaluationRun(row: Record<string, unknown>): EvaluationRun {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    datasetVersion: String(row.dataset_version),
    mode: String(row.mode) as EvaluationRun["mode"],
    results: JSON.parse(String(row.results_json)) as EvaluationRun["results"],
    metrics: JSON.parse(String(row.metrics_json)) as EvaluationRun["metrics"],
    gate: JSON.parse(String(row.gate_json)) as EvaluationRun["gate"],
  };
}

function toTrigramMatch(text: string): string | null {
  const terms = text.match(/[\p{L}\p{M}\p{N}]{3,}/gu) ?? [];
  return terms.length ? terms.map((term) => `"${term.replace(/"/gu, "")}"`).join(" OR ") : null;
}
