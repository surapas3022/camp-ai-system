import type { EvaluationRun, FeedbackRecord, OperationalEvent, TaskSummary, TraceEvent, UserRole } from "../contracts";
import type { AuditRecord, SecurityRepository } from "../security";
import { readCorpusManifest } from "./manifest";
import { seedSourceFile, SupabaseCorpusStore, type PersistedAgentWorkspace } from "./supabase-store";
import type { CorpusManifest, DocumentDetail, DocumentSummary, RetrievedChunk } from "./types";

export class SupabaseCorpusService implements SecurityRepository {
  readonly manifest: CorpusManifest;
  private readonly store = new SupabaseCorpusStore();

  constructor() {
    this.manifest = readCorpusManifest();
  }

  close() { /* HTTP client has no persistent handle. */ }

  async listDocuments(role: UserRole = "public"): Promise<DocumentSummary[]> {
    return (await this.store.listDocuments(role)).map((document) => this.withManifest(document));
  }

  async getDocument(id: string): Promise<DocumentDetail | null> {
    const document = await this.store.getDocument(id);
    return document ? { ...this.withManifest(document), chunks: document.chunks } : null;
  }

  async getSourceFile(id: string): Promise<{ path: string; filename: string } | null> {
    const filename = await this.store.getSourceFilename(id);
    return filename ? seedSourceFile(filename) : null;
  }

  async searchKeyword(question: string, limit: number, role: UserRole = "public"): Promise<RetrievedChunk[]> {
    return this.store.searchKeyword(question, limit, role);
  }

  /** Hosted retrieval stays keyword-only so Vercel does not download the E5 model. */
  async searchSemantic(question: string, limit: number, role: UserRole = "public"): Promise<RetrievedChunk[]> {
    return this.searchKeyword(question, limit, role);
  }

  async quarantineChunk(input: { chunkId: number; reasonCode: string; detectorVersion: string; contentFingerprint: string }): Promise<boolean> {
    return this.store.quarantineChunk(input);
  }

  async recordAudit(event: AuditRecord): Promise<void> { await this.store.recordAudit(event); }

  async listAuditEvents(limit: number): Promise<AuditRecord[]> { return this.store.listAuditEvents(limit); }

  async recordAgentTask(summary: TaskSummary): Promise<void> { await this.store.recordAgentTask(summary); }

  async recordAgentTrace(event: TraceEvent): Promise<void> { await this.store.recordAgentTrace(event); }

  async saveAgentWorkspace(payload: PersistedAgentWorkspace): Promise<void> { await this.store.saveAgentWorkspace(payload); }

  async loadAgentWorkspace(taskId: string): Promise<PersistedAgentWorkspace | null> { return this.store.loadAgentWorkspace(taskId); }

  async loadAgentWorkspaceByIdempotency(role: UserRole, idempotencyKey: string): Promise<PersistedAgentWorkspace | null> {
    return this.store.loadAgentWorkspaceByIdempotency(role, idempotencyKey);
  }

  async recordOperationalEvent(event: OperationalEvent): Promise<void> { await this.store.recordOperationalEvent(event); }

  async listOperationalEvents(limit: number): Promise<OperationalEvent[]> { return this.store.listOperationalEvents(limit); }

  async recordEvaluationRun(run: EvaluationRun): Promise<void> { await this.store.recordEvaluationRun(run); }

  async latestEvaluationRun(): Promise<EvaluationRun | null> { return this.store.latestEvaluationRun(); }

  async recordFeedback(record: FeedbackRecord): Promise<void> { await this.store.recordFeedback(record); }

  async listFeedback(limit: number): Promise<FeedbackRecord[]> { return this.store.listFeedback(limit); }

  private withManifest<T extends DocumentSummary>(document: T): T {
    const entry = this.manifest.sourceFiles.find((item) => item.id === document.id);
    if (!entry) throw new Error(`Seed manifest has no entry for document ${document.id}.`);
    return {
      ...document,
      title: entry.title,
      accessLevel: entry.classification,
      originalFilename: entry.sourceFilename,
      pageCount: entry.pageCount,
      chunkCount: entry.chunkCount,
      adversarialFixture: entry.adversarialFixture,
      fixtureType: entry.fixtureType,
    };
  }
}

let hosted: SupabaseCorpusService | undefined;

export function getSupabaseCorpusService(): SupabaseCorpusService {
  hosted ??= new SupabaseCorpusService();
  return hosted;
}
