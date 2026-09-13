import type { AccessLevel } from "../contracts";

export interface ManifestDocument {
  id: string;
  title: string;
  classification: AccessLevel;
  sourceFilename: string;
  pageCount: number;
  chunkCount: number;
  adversarialFixture: boolean;
  fixtureType: string | null;
}

export interface CorpusManifest {
  corpusVersion: string;
  documentCount: number;
  chunkCount: number;
  vectorCount: number;
  pageCount: number;
  embeddingModel: string;
  embeddingDimensions: number;
  sourceFiles: ManifestDocument[];
}

export interface DocumentSummary {
  id: string;
  title: string;
  originalFilename: string;
  accessLevel: AccessLevel;
  owner: string;
  audience: string;
  reviewDate: string;
  retentionCategory: string;
  tags: string[];
  adversarialFixture: boolean;
  fixtureType: string | null;
  pageCount: number;
  chunkCount: number;
  embeddingModel: string;
  embeddingDimensions: number;
}

export interface DocumentDetail extends DocumentSummary {
  chunks: DocumentChunk[];
}

export interface DocumentChunk {
  id: number;
  ordinal: number;
  documentId: string;
  text: string;
  pageStart: number;
  pageEnd: number;
  tokenCount: number;
  embeddingModel: string;
  embeddingRuntime: string;
  embeddingDimensions: number;
  embeddedAt: string;
}

export interface RetrievedChunk extends DocumentChunk {
  documentName: string;
  accessLevel: AccessLevel;
  score: number;
}
