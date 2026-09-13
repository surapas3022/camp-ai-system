export const GUARDRAIL_VERSION = "2026-09-06.1";

export type GuardrailReason =
  | "direct_prompt_injection"
  | "pii_email"
  | "pii_phone"
  | "pii_national_id"
  | "pii_passport"
  | "pii_payment_card"
  | "pii_ip_address"
  | "pii_credential"
  | "indirect_prompt_injection";

export interface GuardrailMatch {
  reason: GuardrailReason;
  detectorVersion: string;
}

const directInjectionPatterns = [
  /\b(?:ignore|disregard|override|bypass)\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions?|rules?|polic(?:y|ies))/iu,
  /\b(?:reveal|show|print|extract|leak)\s+(?:the\s+)?(?:system\s+prompt|hidden\s+instructions?|developer\s+message)/iu,
  /\b(?:act as|you are now|switch to)\s+(?:an?\s+)?(?:system|developer|admin|unrestricted)\b/iu,
  /\b(?:reveal|exfiltrate|dump)\s+(?:staff[-\s]?only|confidential|secret|credential|api\s*key|password)/iu,
  /\bdo not\s+(?:cite|follow|obey)\s+(?:sources?|rules?|instructions?)/iu,
];

const indirectInjectionPatterns = [
  /\b(?:ignore|disregard|override|bypass)\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions?|rules?|polic(?:y|ies))/iu,
  /\b(?:reveal|show|print|extract|leak)\s+(?:the\s+)?(?:system\s+prompt|hidden\s+instructions?|staff[-\s]?only\s+(?:data|procedures?))/iu,
  /\b(?:do not cite|follow these instructions instead|you are now)\b/iu,
];

const piiPatterns: Array<[GuardrailReason, RegExp]> = [
  ["pii_credential", /\b(?:api[_ -]?key|secret|password|passwd|token)\s*[:=]\s*[^\s]{6,}/iu],
  ["pii_email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu],
  ["pii_payment_card", /\b(?:\d[ -]*?){13,19}\b/u],
  ["pii_ip_address", /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/u],
  ["pii_passport", /\b(?:passport(?:\s*(?:number|no\.?))?\s*[:#]?\s*[A-Z]{1,2}\d{6,9}|[A-Z]{1,2}\d{7,8})\b/iu],
  ["pii_national_id", /\b(?:\d[ -]?){13}\b|\b\d{3}-\d{2}-\d{4}\b/u],
  ["pii_phone", /(?<!\d)(?:\+?66|0)\d(?:[ -]?\d){7,9}\b|\b\+?1[ -]?(?:\d[ -]?){9,10}\b/u],
];

export function inspectQuestion(value: string): GuardrailMatch | null {
  for (const pattern of directInjectionPatterns) if (pattern.test(value)) return match("direct_prompt_injection");
  for (const [reason, pattern] of piiPatterns) if (pattern.test(value)) return match(reason);
  return null;
}

export function inspectRetrievedChunk(value: string): GuardrailMatch | null {
  for (const pattern of indirectInjectionPatterns) if (pattern.test(value)) return match("indirect_prompt_injection");
  return null;
}

export function isPiiReason(reason: GuardrailReason): boolean {
  return reason.startsWith("pii_");
}

function match(reason: GuardrailReason): GuardrailMatch {
  return { reason, detectorVersion: GUARDRAIL_VERSION };
}
