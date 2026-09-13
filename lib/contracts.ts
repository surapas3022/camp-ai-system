export type UserRole = "public" | "staff";
export type AccessLevel = "public" | "staff";

export type GuardrailDecision =
  | "allow"
  | "refuse_input"
  | "refuse_pii"
  | "no_authorized_evidence"
  | "unsafe_output";

export type SafeAnswerStatus =
  | "grounded"
  | "ambiguous"
  | "not_found"
  | "refused"
  | "unsafe_output";

export interface AuditEvent {
  id: string;
  createdAt: string;
  requestFingerprint: string;
  answerFingerprint: string | null;
  role: UserRole;
  mode: "keyword" | "semantic";
  language: "en" | "th";
  decision: GuardrailDecision;
  reasonCodes: string[];
  authorizedChunkCount: number;
  citationChunkIds: string[];
  incidentFound: boolean;
}

export type TaskState = "planned" | "awaiting_approval" | "completed" | "declined" | "safely_stopped";
export type ToolName = "search_knowledge_base" | "create_draft" | "request_approval";
export type ApprovalOutcome = "approve" | "decline";

export interface ToolCall {
  name: ToolName;
  step: number;
  evidenceIds: string[];
}

export interface EvidenceRef {
  id: string;
  documentId: string;
  documentName: string;
  accessLevel: AccessLevel;
  pageStart: number;
  pageEnd: number;
  sourceHref: string;
  citationFingerprint: string;
}

export interface Draft {
  version: number;
  body: string;
  evidenceIds: string[];
  fingerprint: string;
}

export interface ApprovalDecision {
  decision: ApprovalOutcome;
  draftVersion: number;
  decidedAt: string;
}

export interface TraceEvent {
  id: string;
  taskId: string;
  createdAt: string;
  fromState: TaskState | null;
  toState: TaskState;
  tool: ToolName | null;
  outcome: "ok" | "stopped" | "declined";
  evidenceCount: number;
  draftVersion: number | null;
  reasonCode: string | null;
  step: number;
}

export interface TaskSummary {
  taskId: string;
  createdAt: string;
  updatedAt: string;
  role: UserRole;
  state: TaskState;
  taskFingerprint: string;
  evidenceCount: number;
  draftVersion: number | null;
  approval: ApprovalDecision | null;
  reasonCodes: string[];
  stepCount: number;
}

export interface AgentWorkspace {
  summary: TaskSummary;
  plan: string[];
  evidence: EvidenceRef[];
  draft: Draft | null;
  trace: TraceEvent[];
  result: string | null;
}

export type EvaluationKind = "supported" | "ambiguous" | "unsafe" | "no-evidence" | "approval" | "schema" | "provider-failure";
export type EvaluationSurface = "answer" | "agent";
export type EvaluationMode = "fixture" | "provider";
export type EvaluationProbe = "poisoned" | "forged_citation" | "provider_failure";
export type ReleaseImpact = "block" | "observe";
export type GateStatus = "pass" | "fail" | "not_run";
export type ErrorClass = "none" | "provider" | "validation" | "internal";
export const RELEASE_GATE_GROUPS = [
  { id: "supported_public_answers", label: "Supported public answers", requiredCount: 2, requiredOutcome: "Grounded result and supported public citations" },
  { id: "supported_staff_work", label: "Supported staff work", requiredCount: 1, requiredOutcome: "Staff access stays server-authorised" },
  { id: "ambiguous_and_no_evidence", label: "Ambiguous and no evidence", requiredCount: 2, requiredOutcome: "Safe clarification or no-evidence result" },
  { id: "unsafe_and_pii_intake", label: "Unsafe and PII intake", requiredCount: 2, requiredOutcome: "Stops before retrieval/provider access" },
  { id: "access_and_poisoned_evidence", label: "Access and poisoned evidence", requiredCount: 2, requiredOutcome: "No leakage and quarantine exclusion" },
  { id: "agent_approval", label: "Agent approval", requiredCount: 1, requiredOutcome: "One current-version decision only" },
  { id: "citation_schema_rejection", label: "Citation/schema rejection", requiredCount: 1, requiredOutcome: "No unsupported grounded result" },
  { id: "provider_failure", label: "Provider failure", requiredCount: 1, requiredOutcome: "Bounded retries then safe error" },
] as const;
export type EvaluationGateGroup = typeof RELEASE_GATE_GROUPS[number]["id"];
export type OperationalKind = "answer" | "agent" | "evaluation" | "feedback";
export type FeedbackKind = "quality" | "safety";
export type FeedbackRating = "up" | "down";
export type FeedbackSurface = "answer" | "agent" | "system";

export interface EvaluationCaseResult {
  caseId: string;
  group: EvaluationGateGroup;
  kind: EvaluationKind;
  surface: EvaluationSurface;
  role: UserRole;
  evaluatorLabel: string;
  expectedOutcome: string;
  actualOutcome: string;
  citationSupport: boolean;
  citationFingerprints: string[];
  safeStop: boolean;
  reasonCode: string | null;
  attemptCount: number;
  retryCount: number;
  accessIsolation: boolean;
  latencyMs: number;
  errorClass: ErrorClass;
  promptTokens: number | null;
  completionTokens: number | null;
  estimatedCost: number | null;
  costStatus: "available" | "unavailable";
  rateCardAsOf: string | null;
  releaseImpact: ReleaseImpact;
  passed: boolean;
  qualityNote: string;
}

export interface EvaluationMetrics {
  caseCount: number;
  passedCount: number;
  citationSupportRate: number;
  safeStopPassRate: number;
  accessIsolationRate: number;
  errorRate: number;
  latencyMsP50: number;
  retryCountTotal: number;
  promptTokens: number | null;
  completionTokens: number | null;
  estimatedCost: number | null;
  costStatus: "available" | "unavailable";
  rateCardAsOf: string | null;
  qualityNotes: Record<string, number>;
}

export interface ReleaseGateGroupResult {
  id: EvaluationGateGroup;
  label: string;
  cases: number;
  requiredCount: number;
  passedCount: number;
  requiredOutcome: string;
  status: GateStatus;
}

export interface ReleaseGate {
  status: GateStatus;
  blockingFailures: string[];
  reasons: string[];
  groups: ReleaseGateGroupResult[];
}

export interface EvaluationRun {
  id: string;
  createdAt: string;
  datasetVersion: string;
  mode: EvaluationMode;
  results: EvaluationCaseResult[];
  metrics: EvaluationMetrics;
  gate: ReleaseGate;
}

export interface EvaluationCaseSummary {
  id: string;
  group: EvaluationGateGroup;
  kind: EvaluationKind;
  surface: EvaluationSurface;
  expectedOutcome: string;
  releaseImpact: ReleaseImpact;
}

export interface OperationalEvent {
  id: string;
  createdAt: string;
  kind: OperationalKind;
  outcome: string;
  latencyMs: number | null;
  errorClass: ErrorClass;
  citationCount: number;
  estimatedCostUsd: number | null;
}

export interface OperationalAggregates {
  eventCount: number;
  outcomes: Record<string, number>;
  safeStopRate: number | null;
  latencyMsP50: number | null;
  errorRate: number;
  estimatedCostUsd: number | null;
  costStatus: "available" | "unavailable";
}

export interface FeedbackRecord {
  id: string;
  createdAt: string;
  role: UserRole;
  kind: FeedbackKind;
  rating: FeedbackRating;
  reasonCodes: string[];
  surface: FeedbackSurface;
  payloadFingerprint: string;
}

export interface FeedbackSummary {
  total: number;
  byKind: Record<string, number>;
  byRating: Record<string, number>;
}

export interface EvaluationDashboard {
  datasetVersion: string;
  caseCount: number;
  cases: EvaluationCaseSummary[];
  lastRun: EvaluationRun | null;
  operational: OperationalAggregates;
  feedback: FeedbackSummary;
  gate: ReleaseGate;
}
