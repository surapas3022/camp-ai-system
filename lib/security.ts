import { createHash, createHmac, randomUUID } from "node:crypto";
import type { GuardrailDecision, OperationalEvent, UserRole } from "./contracts";
import type { RetrievalMode } from "./rag";

export interface AuditEventInput {
  question: string;
  answer?: string;
  role: UserRole;
  mode: RetrievalMode;
  language: "en" | "th";
  decision: GuardrailDecision;
  reasonCodes: string[];
  authorizedChunkCount: number;
  citationChunkIds: string[];
  incidentFound: boolean;
}

export interface AuditRecord {
  id: string;
  createdAt: string;
  requestFingerprint: string;
  answerFingerprint: string | null;
  role: UserRole;
  mode: RetrievalMode;
  language: "en" | "th";
  decision: GuardrailDecision;
  reasonCodes: string[];
  authorizedChunkCount: number;
  citationChunkIds: string[];
  incidentFound: boolean;
}

export interface SecurityRepository {
  quarantineChunk(input: { chunkId: number; reasonCode: string; detectorVersion: string; contentFingerprint: string }): boolean | Promise<boolean>;
  recordAudit(event: AuditRecord): void | Promise<void>;
  listAuditEvents(limit: number): AuditRecord[] | Promise<AuditRecord[]>;
  recordOperationalEvent?(event: OperationalEvent): void | Promise<void>;
}

export function securitySecret(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env.AUDIT_FINGERPRINT_SECRET?.trim();
  if (configured) return configured;
  if (env.NODE_ENV === "production") throw new Error("Set AUDIT_FINGERPRINT_SECRET before starting Secure RAG in production.");
  return "secure-rag-v2-development-secret-not-for-production";
}

export function fingerprint(secret: string, purpose: "request" | "answer" | "chunk", value: string): string {
  return createHmac("sha256", secret).update(`${purpose}:v1:\0${value}`, "utf8").digest("base64url");
}

export function citationFingerprint(secret: string, source: { chunkId: number; documentId: string; pageStart: number; pageEnd: number; text: string }): string {
  const contentHash = createHash("sha256").update(source.text, "utf8").digest("hex");
  return createHmac("sha256", secret)
    .update(`citation:v1\0${source.chunkId}\0${source.documentId}\0${source.pageStart}\0${source.pageEnd}\0${contentHash}`, "utf8")
    .digest("base64url");
}

export function newAuditRecord(secret: string, input: AuditEventInput): AuditRecord {
  return {
    id: randomUUID(), createdAt: new Date().toISOString(),
    requestFingerprint: fingerprint(secret, "request", input.question),
    answerFingerprint: input.answer ? fingerprint(secret, "answer", input.answer) : null,
    role: input.role, mode: input.mode, language: input.language, decision: input.decision,
    reasonCodes: [...new Set(input.reasonCodes)].sort(), authorizedChunkCount: input.authorizedChunkCount,
    citationChunkIds: [...new Set(input.citationChunkIds)].sort(), incidentFound: input.incidentFound,
  };
}
