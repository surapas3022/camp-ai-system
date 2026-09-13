import { existsSync } from "node:fs";
import path from "node:path";
import type {
  AccessLevel, EvaluationRun, FeedbackRecord, OperationalEvent, TaskSummary, TraceEvent, UserRole,
} from "../contracts";
import type { AuditRecord } from "../security";
import { getSupabaseAdmin } from "../supabase/admin";
import type { DocumentChunk, DocumentDetail, DocumentSummary, RetrievedChunk } from "./types";

const MAX_EVALUATION_RUNS = 10;
const MAX_OPERATIONAL_EVENTS = 200;
const MAX_FEEDBACK_RECORDS = 100;

const DOCUMENT_FIELDS = `
  id, original_filename, page_count,
  document_metadata!inner (
    access_level, title, owner, audience, review_date, retention_category,
    tags_json, adversarial_fixture, fixture_type
  )
`;

export interface PersistedAgentWorkspace {
  task: string;
  workspace: import("../contracts").AgentWorkspace;
  approvalUsed: boolean;
  startedAt: number;
  role: UserRole;
  idempotencyKey: string;
}

export class SupabaseCorpusStore {
  private readonly client = getSupabaseAdmin();

  async listDocuments(role: UserRole): Promise<DocumentSummary[]> {
    const { data, error } = await this.client.from("documents").select(DOCUMENT_FIELDS).eq("status", "ready").order("id");
    if (error) throw new Error(error.message);
    return (data ?? []).map(toSummary).filter((document) => role === "staff" || document.accessLevel === "public");
  }

  async getDocument(id: string): Promise<DocumentDetail | null> {
    const { data, error } = await this.client.from("documents").select(DOCUMENT_FIELDS).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const { data: chunkRows, error: chunkError } = await this.client
      .from("chunks")
      .select("id, ordinal, document_id, text, page_start, page_end, token_count, chunk_embeddings!inner (model_id, runtime_model_id, dimensions, embedded_at)")
      .eq("document_id", id)
      .order("ordinal");
    if (chunkError) throw new Error(chunkError.message);
    return { ...toSummary(data as Record<string, unknown>), chunks: (chunkRows ?? []).map(toChunk) };
  }

  async getSourceFilename(id: string): Promise<string | null> {
    const { data, error } = await this.client.from("documents").select("stored_filename").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.stored_filename ? String(data.stored_filename) : null;
  }

  async searchKeyword(text: string, limit: number, role: UserRole): Promise<RetrievedChunk[]> {
    const query = toTsQuery(text);
    if (!query) return [];
    const { data, error } = await this.client
      .from("chunks")
      .select(`
        id, ordinal, document_id, text, page_start, page_end, token_count,
        chunk_embeddings!inner (model_id, runtime_model_id, dimensions, embedded_at),
        documents!inner (status, document_metadata!inner (title, access_level))
      `)
      .textSearch("search_text", query, { type: "plain", config: "simple" })
      .eq("documents.status", "ready")
      .limit(limit * 4);
    if (error) throw new Error(error.message);
    const quarantined = await this.quarantinedIds();
    return (data ?? [])
      .map((row) => toRetrievedChunk(flattenSearchRow(row as Record<string, unknown>)))
      .filter((chunk) => (role === "staff" || chunk.accessLevel === "public") && !quarantined.has(chunk.id))
      .slice(0, limit);
  }

  async searchSemantic(embedding: number[], limit: number, role: UserRole): Promise<RetrievedChunk[]> {
    const { data, error } = await this.client.rpc("match_chunks", {
      query_embedding: embedding,
      match_count: limit,
      viewer_role: role,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => toRetrievedChunk(row as Record<string, unknown>));
  }

  async firstStoredVector(): Promise<number[] | null> {
    const { data, error } = await this.client.from("chunk_embeddings").select("embedding").not("embedding", "is", null).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return Array.isArray(data?.embedding) ? data.embedding as number[] : null;
  }

  async quarantineChunk(input: { chunkId: number; reasonCode: string; detectorVersion: string; contentFingerprint: string }): Promise<boolean> {
    const { data, error } = await this.client.from("security_chunk_flags").insert({
      chunk_id: input.chunkId,
      status: "quarantined",
      reason_code: input.reasonCode,
      detector_version: input.detectorVersion,
      content_fingerprint: input.contentFingerprint,
      detected_at: new Date().toISOString(),
    }).select("chunk_id").maybeSingle();
    if (error && /duplicate|unique/iu.test(error.message)) return false;
    if (error) throw new Error(error.message);
    return Boolean(data);
  }

  async recordAudit(event: AuditRecord): Promise<void> {
    const { error } = await this.client.from("audit_events").insert({
      id: event.id,
      created_at: event.createdAt,
      request_fingerprint: event.requestFingerprint,
      answer_fingerprint: event.answerFingerprint,
      role: event.role,
      retrieval_mode: event.mode,
      language: event.language,
      decision: event.decision,
      reason_codes_json: event.reasonCodes,
      authorized_chunk_count: event.authorizedChunkCount,
      citation_chunk_ids_json: event.citationChunkIds,
      incident_found: event.incidentFound,
    });
    if (error) throw new Error(error.message);
  }

  async listAuditEvents(limit: number): Promise<AuditRecord[]> {
    const { data, error } = await this.client.from("audit_events").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      requestFingerprint: String(row.request_fingerprint),
      answerFingerprint: row.answer_fingerprint == null ? null : String(row.answer_fingerprint),
      role: String(row.role) as UserRole,
      mode: String(row.retrieval_mode) as AuditRecord["mode"],
      language: String(row.language) as AuditRecord["language"],
      decision: String(row.decision) as AuditRecord["decision"],
      reasonCodes: asStringArray(row.reason_codes_json),
      authorizedChunkCount: Number(row.authorized_chunk_count),
      citationChunkIds: asStringArray(row.citation_chunk_ids_json),
      incidentFound: Boolean(row.incident_found),
    }));
  }

  async recordAgentTask(summary: TaskSummary): Promise<void> {
    const { error } = await this.client.from("agent_task_summaries").upsert({
      task_id: summary.taskId,
      created_at: summary.createdAt,
      updated_at: summary.updatedAt,
      role: summary.role,
      state: summary.state,
      task_fingerprint: summary.taskFingerprint,
      evidence_count: summary.evidenceCount,
      draft_version: summary.draftVersion,
      approval_json: summary.approval,
      reason_codes_json: summary.reasonCodes,
      step_count: summary.stepCount,
    });
    if (error) throw new Error(error.message);
  }

  async recordAgentTrace(event: TraceEvent): Promise<void> {
    const { error } = await this.client.from("agent_trace_events").insert({
      id: event.id,
      task_id: event.taskId,
      created_at: event.createdAt,
      from_state: event.fromState,
      to_state: event.toState,
      tool: event.tool,
      outcome: event.outcome,
      evidence_count: event.evidenceCount,
      draft_version: event.draftVersion,
      reason_code: event.reasonCode,
      step: event.step,
    });
    if (error) throw new Error(error.message);
  }

  async saveAgentWorkspace(payload: PersistedAgentWorkspace): Promise<void> {
    const { error } = await this.client.from("agent_workspaces").upsert({
      task_id: payload.workspace.summary.taskId,
      created_at: payload.workspace.summary.createdAt,
      updated_at: payload.workspace.summary.updatedAt,
      role: payload.role,
      idempotency_key: payload.idempotencyKey,
      approval_used: payload.approvalUsed,
      started_at_ms: payload.startedAt,
      payload,
    });
    if (error) throw new Error(error.message);
  }

  async loadAgentWorkspace(taskId: string): Promise<PersistedAgentWorkspace | null> {
    const { data, error } = await this.client.from("agent_workspaces").select("payload").eq("task_id", taskId).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.payload ? data.payload as PersistedAgentWorkspace : null;
  }

  async loadAgentWorkspaceByIdempotency(role: UserRole, idempotencyKey: string): Promise<PersistedAgentWorkspace | null> {
    const { data, error } = await this.client.from("agent_workspaces").select("payload").eq("role", role).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.payload ? data.payload as PersistedAgentWorkspace : null;
  }

  async recordOperationalEvent(event: OperationalEvent): Promise<void> {
    const { error } = await this.client.from("operational_events").insert({
      id: event.id,
      created_at: event.createdAt,
      kind: event.kind,
      outcome: event.outcome,
      latency_ms: event.latencyMs,
      error_class: event.errorClass,
      citation_count: event.citationCount,
      estimated_cost_usd: event.estimatedCostUsd,
    });
    if (error) throw new Error(error.message);
    await this.pruneOldest("operational_events", MAX_OPERATIONAL_EVENTS);
  }

  async listOperationalEvents(limit: number): Promise<OperationalEvent[]> {
    const { data, error } = await this.client.from("operational_events").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
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

  async recordEvaluationRun(run: EvaluationRun): Promise<void> {
    const { error } = await this.client.from("evaluation_runs").insert({
      id: run.id,
      created_at: run.createdAt,
      dataset_version: run.datasetVersion,
      mode: run.mode,
      results_json: run.results,
      metrics_json: run.metrics,
      gate_json: run.gate,
    });
    if (error) throw new Error(error.message);
    await this.pruneOldest("evaluation_runs", MAX_EVALUATION_RUNS);
  }

  async latestEvaluationRun(): Promise<EvaluationRun | null> {
    const { data, error } = await this.client.from("evaluation_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      id: String(data.id),
      createdAt: String(data.created_at),
      datasetVersion: String(data.dataset_version),
      mode: data.mode as EvaluationRun["mode"],
      results: data.results_json as EvaluationRun["results"],
      metrics: data.metrics_json as EvaluationRun["metrics"],
      gate: data.gate_json as EvaluationRun["gate"],
    };
  }

  async recordFeedback(record: FeedbackRecord): Promise<void> {
    const { error } = await this.client.from("feedback_events").insert({
      id: record.id,
      created_at: record.createdAt,
      role: record.role,
      kind: record.kind,
      rating: record.rating,
      reason_codes_json: record.reasonCodes,
      surface: record.surface,
      payload_fingerprint: record.payloadFingerprint,
    });
    if (error) throw new Error(error.message);
    await this.pruneOldest("feedback_events", MAX_FEEDBACK_RECORDS);
  }

  async listFeedback(limit: number): Promise<FeedbackRecord[]> {
    const { data, error } = await this.client.from("feedback_events").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      role: String(row.role) as UserRole,
      kind: String(row.kind) as FeedbackRecord["kind"],
      rating: String(row.rating) as FeedbackRecord["rating"],
      reasonCodes: asStringArray(row.reason_codes_json),
      surface: String(row.surface) as FeedbackRecord["surface"],
      payloadFingerprint: String(row.payload_fingerprint),
    }));
  }

  private async quarantinedIds(): Promise<Set<number>> {
    const { data, error } = await this.client.from("security_chunk_flags").select("chunk_id").eq("status", "quarantined");
    if (error) throw new Error(error.message);
    return new Set((data ?? []).map((row) => Number(row.chunk_id)));
  }

  private async pruneOldest(table: "operational_events" | "evaluation_runs" | "feedback_events", keep: number) {
    const { data, error } = await this.client.from(table).select("id").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const extra = (data ?? []).slice(keep).map((row) => String(row.id));
    if (!extra.length) return;
    const { error: deleteError } = await this.client.from(table).delete().in("id", extra);
    if (deleteError) throw new Error(deleteError.message);
  }
}

export function seedSourceFile(projectRoot: string, filename: string): { path: string; filename: string } | null {
  const safeFilename = path.basename(filename);
  const sourcePath = path.join(projectRoot, "data", "seed", "source-files", safeFilename);
  return existsSync(sourcePath) ? { path: sourcePath, filename: safeFilename } : null;
}

function metadata(row: Record<string, unknown>): Record<string, unknown> {
  const value = row.document_metadata;
  if (Array.isArray(value)) return (value[0] ?? {}) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

function embedding(row: Record<string, unknown>): Record<string, unknown> {
  const value = row.chunk_embeddings;
  if (Array.isArray(value)) return (value[0] ?? {}) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

function flattenSearchRow(row: Record<string, unknown>): Record<string, unknown> {
  const documents = Array.isArray(row.documents) ? row.documents[0] : row.documents;
  const document = (documents ?? {}) as Record<string, unknown>;
  const meta = metadata(document);
  const embed = embedding(row);
  return {
    ...row,
    title: meta.title,
    access_level: meta.access_level,
    model_id: embed.model_id,
    runtime_model_id: embed.runtime_model_id,
    dimensions: embed.dimensions,
    embedded_at: embed.embedded_at,
    score: 0,
  };
}

function toSummary(row: Record<string, unknown>): DocumentSummary {
  const meta = metadata(row);
  return {
    id: String(row.id),
    title: String(meta.title),
    originalFilename: String(row.original_filename),
    accessLevel: String(meta.access_level) as AccessLevel,
    owner: String(meta.owner),
    audience: String(meta.audience),
    reviewDate: String(meta.review_date),
    retentionCategory: String(meta.retention_category),
    tags: asStringArray(meta.tags_json),
    adversarialFixture: Boolean(meta.adversarial_fixture),
    fixtureType: meta.fixture_type == null ? null : String(meta.fixture_type),
    pageCount: Number(row.page_count),
    chunkCount: 0,
    embeddingModel: "intfloat/multilingual-e5-small",
    embeddingDimensions: 384,
  };
}

function toChunk(row: Record<string, unknown>): DocumentChunk {
  const embed = embedding(row);
  return {
    id: Number(row.id),
    ordinal: Number(row.ordinal),
    documentId: String(row.document_id),
    text: String(row.text),
    pageStart: Number(row.page_start),
    pageEnd: Number(row.page_end),
    tokenCount: Number(row.token_count),
    embeddingModel: String(embed.model_id ?? "intfloat/multilingual-e5-small"),
    embeddingRuntime: String(embed.runtime_model_id ?? "Xenova/multilingual-e5-small"),
    embeddingDimensions: Number(embed.dimensions ?? 384),
    embeddedAt: String(embed.embedded_at ?? ""),
  };
}

function toRetrievedChunk(row: Record<string, unknown>): RetrievedChunk {
  return {
    ...toChunk(row),
    documentName: String(row.title),
    accessLevel: String(row.access_level) as AccessLevel,
    score: Number(row.score ?? 0),
  };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") {
    try { return JSON.parse(value) as string[]; } catch { return []; }
  }
  return [];
}

function toTsQuery(text: string): string | null {
  const terms = text.match(/[\p{L}\p{M}\p{N}]{3,}/gu) ?? [];
  return terms.length ? terms.join(" ") : null;
}
