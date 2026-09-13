import type { AccessLevel, SafeAnswerStatus, UserRole } from "./contracts";
import type { RetrievedChunk } from "./corpus/types";

export type Language = "en" | "th";
export type RetrievalMode = "keyword" | "semantic";
export { type SafeAnswerStatus };

export interface Citation {
  number: number;
  chunkId: string;
  documentId: string;
  documentName: string;
  accessLevel: AccessLevel;
  excerpt: string;
  pageStart: number;
  pageEnd: number;
  fingerprint?: string;
}

export interface RetrievalResult { chunks: RetrievedChunk[]; }

export const RETRIEVAL_LIMIT = 10;
export const SEMANTIC_DISTANCE_CUTOFF = 1;

export async function retrieve(question: string, mode: RetrievalMode, role: UserRole): Promise<RetrievalResult> {
  const { getCorpusService } = await import("./corpus/factory");
  const service = await getCorpusService();
  const chunks = mode === "keyword"
    ? await Promise.resolve(service.searchKeyword(question, RETRIEVAL_LIMIT, role))
    : (await service.searchSemantic(question, RETRIEVAL_LIMIT, role)).filter((chunk) => chunk.score < SEMANTIC_DISTANCE_CUTOFF);
  return { chunks };
}

export function toCitation(chunk: RetrievedChunk, number: number): Citation {
  return {
    number, chunkId: String(chunk.id), documentId: chunk.documentId, documentName: chunk.documentName,
    accessLevel: chunk.accessLevel, excerpt: `${chunk.text.slice(0, 360).trim()}${chunk.text.length > 360 ? "…" : ""}`,
    pageStart: chunk.pageStart, pageEnd: chunk.pageEnd,
  };
}

export function noEvidenceMessage(language: Language): string {
  return language === "th" ? "ไม่พบหลักฐานในคลังเอกสารนี้ที่รองรับคำตอบ" : "I could not find supporting evidence in this document collection.";
}

export function clarificationMessage(language: Language): string {
  return language === "th" ? "ช่วยระบุคำถามให้เฉพาะเจาะจงมากขึ้นได้ไหม" : "Could you clarify your question?";
}
