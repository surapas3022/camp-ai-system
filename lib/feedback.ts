import { randomUUID } from "node:crypto";
import type { FeedbackKind, FeedbackRating, FeedbackRecord, FeedbackSurface, UserRole } from "./contracts";
import { fingerprint } from "./security";

export const FEEDBACK_REASON_CODES = [
  "inaccurate",
  "unhelpful",
  "good_quality",
  "unsafe_output",
  "missed_refusal",
  "privacy_concern",
] as const;

export type FeedbackReasonCode = (typeof FEEDBACK_REASON_CODES)[number];

export interface FeedbackRequest {
  kind: FeedbackKind;
  rating: FeedbackRating;
  reasonCodes: FeedbackReasonCode[];
  surface: FeedbackSurface;
}

export class FeedbackRequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function parseFeedbackRequest(value: unknown): FeedbackRequest {
  const body = exactRecord(value, ["kind", "rating", "reasonCodes", "surface"]);
  if (body.kind !== "quality" && body.kind !== "safety") throw new FeedbackRequestError("Choose a quality or safety rating.");
  if (body.rating !== "up" && body.rating !== "down") throw new FeedbackRequestError("Choose an up or down rating.");
  if (body.surface !== "answer" && body.surface !== "agent" && body.surface !== "system") throw new FeedbackRequestError("Choose a supported surface.");
  if (!Array.isArray(body.reasonCodes) || body.reasonCodes.length > 3) throw new FeedbackRequestError("Use at most three reason codes.");
  if (!body.reasonCodes.every((code) => typeof code === "string" && FEEDBACK_REASON_CODES.includes(code as FeedbackReasonCode))) {
    throw new FeedbackRequestError("Use only allowlisted reason codes.");
  }
  const reasonCodes = [...new Set(body.reasonCodes)] as FeedbackReasonCode[];
  return { kind: body.kind, rating: body.rating, reasonCodes, surface: body.surface };
}

export function newFeedbackRecord(secret: string, input: FeedbackRequest, role: UserRole): FeedbackRecord {
  const reasonCodes = [...input.reasonCodes].sort();
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    role,
    kind: input.kind,
    rating: input.rating,
    reasonCodes,
    surface: input.surface,
    payloadFingerprint: fingerprint(secret, "request", `${input.kind}:${input.rating}:${reasonCodes.join(",")}:${input.surface}`),
  };
}

function exactRecord(value: unknown, keys: string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new FeedbackRequestError("Use a JSON object.");
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new FeedbackRequestError("The request contains an unknown or missing field.");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
