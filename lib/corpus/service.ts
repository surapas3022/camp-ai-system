import { existsSync } from "node:fs";
import path from "node:path";
import { bootstrapSeed, type RuntimePaths } from "./bootstrap";
import { LocalE5QueryEmbeddingProvider, type QueryEmbeddingProvider } from "./embeddings";
import { readCorpusManifest } from "./manifest";
import { SeedCorpusStore } from "./store";
import type { EvaluationRun, FeedbackRecord, OperationalEvent, TaskSummary, TraceEvent, UserRole } from "../contracts";
import type { AuditRecord, SecurityRepository } from "../security";
import type { CorpusManifest, DocumentDetail, DocumentSummary, RetrievedChunk } from "./types";

export class SeedCorpusService implements SecurityRepository {
  readonly paths: RuntimePaths;
  readonly manifest: CorpusManifest;
  private readonly store: SeedCorpusStore;
  private readonly embeddings: QueryEmbeddingProvider;

  constructor(options: { projectRoot?: string; runtimeDir?: string; embeddings?: QueryEmbeddingProvider } = {}) {
    this.paths = bootstrapSeed(options);
    this.manifest = readCorpusManifest(this.paths.projectRoot);
    this.store = new SeedCorpusStore(this.paths.databasePath);
    this.embeddings = options.embeddings ?? new LocalE5QueryEmbeddingProvider(
      process.env.SECURE_RAG_MODEL_CACHE?.trim() || path.join(this.paths.runtimeDir, "model-cache"),
    );
  }

  close() { this.store.close(); }

  listDocuments(role: UserRole = "public"): DocumentSummary[] {
    return this.store.listDocuments(role).map((document) => this.withManifest(document));
  }

  getDocument(id: string): DocumentDetail | null {
    const document = this.store.getDocument(id);
    return document ? { ...this.withManifest(document), chunks: document.chunks } : null;
  }

  getSourceFile(id: string): { path: string; filename: string } | null {
    const filename = this.store.getSourceFilename(id);
    if (!filename) return null;
    const safeFilename = path.basename(filename);
    const sourcePath = path.join(this.paths.sourceDir, safeFilename);
    return existsSync(sourcePath) ? { path: sourcePath, filename: safeFilename } : null;
  }

  searchKeyword(question: string, limit: number, role: UserRole = "public"): RetrievedChunk[] {
    return this.store.searchKeyword(question, limit, role);
  }

  async searchSemantic(question: string, limit: number, role: UserRole = "public"): Promise<RetrievedChunk[]> {
    const [embedding] = await this.embeddings.embedQueries([question]);
    if (!embedding || embedding.length !== this.manifest.embeddingDimensions) {
      throw new Error("The local E5 query embedding has an unexpected dimension.");
    }
    return this.store.searchSemantic(JSON.stringify(embedding), limit, role);
  }

  /** Used by the baseline semantic test without downloading the E5 model. */
  searchSemanticWithStoredVector(limit: number, role: UserRole = "public"): RetrievedChunk[] {
    return this.store.searchSemantic(this.store.firstStoredVector(), limit, role);
  }

  quarantineChunk(input: { chunkId: number; reasonCode: string; detectorVersion: string; contentFingerprint: string }): boolean {
    return this.store.quarantineChunk(input);
  }

  recordAudit(event: AuditRecord): void { this.store.recordAudit(event); }

  listAuditEvents(limit: number): AuditRecord[] { return this.store.listAuditEvents(limit); }

  recordAgentTask(summary: TaskSummary): void { this.store.recordAgentTask(summary); }

  recordAgentTrace(event: TraceEvent): void { this.store.recordAgentTrace(event); }

  recordOperationalEvent(event: OperationalEvent): void { this.store.recordOperationalEvent(event); }

  listOperationalEvents(limit: number): OperationalEvent[] { return this.store.listOperationalEvents(limit); }

  recordEvaluationRun(run: EvaluationRun): void { this.store.recordEvaluationRun(run); }

  latestEvaluationRun(): EvaluationRun | null { return this.store.latestEvaluationRun(); }

  recordFeedback(record: FeedbackRecord): void { this.store.recordFeedback(record); }

  listFeedback(limit: number): FeedbackRecord[] { return this.store.listFeedback(limit); }

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

let singleton: SeedCorpusService | undefined;

export function getSeedCorpusService(): SeedCorpusService {
  singleton ??= new SeedCorpusService();
  return singleton;
}

export async function getCorpusService() {
  const { isSupabaseConfigured } = await import("../supabase/config");
  if (process.env.VERCEL && !isSupabaseConfigured()) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY before deploying to Vercel.");
  }
  if (isSupabaseConfigured()) {
    const { getSupabaseCorpusService } = await import("./supabase-service");
    return getSupabaseCorpusService();
  }
  return getSeedCorpusService();
}
