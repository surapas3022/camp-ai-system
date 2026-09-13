import { randomUUID } from "node:crypto";
import type { FeedbackRecord, FeedbackSummary, OperationalAggregates, OperationalEvent } from "./contracts";

const SAFE_STOP_OUTCOMES = new Set(["refused", "not_found", "safely_stopped"]);

export function newOperationalEvent(input: Omit<OperationalEvent, "id" | "createdAt">): OperationalEvent {
  return { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
}

export function summarizeOperationalEvents(events: OperationalEvent[]): OperationalAggregates {
  const outcomes: Record<string, number> = {};
  const latencies: number[] = [];
  const costs: number[] = [];
  let safeStops = 0;
  let errors = 0;
  for (const event of events) {
    outcomes[event.outcome] = (outcomes[event.outcome] ?? 0) + 1;
    if (event.latencyMs != null) latencies.push(event.latencyMs);
    if (event.estimatedCostUsd != null) costs.push(event.estimatedCostUsd);
    if (SAFE_STOP_OUTCOMES.has(event.outcome)) safeStops += 1;
    if (event.errorClass !== "none") errors += 1;
  }
  return {
    eventCount: events.length,
    outcomes,
    safeStopRate: events.length ? safeStops / events.length : null,
    latencyMsP50: percentile50(latencies),
    errorRate: events.length ? errors / events.length : 0,
    estimatedCostUsd: costs.length ? costs.reduce((total, value) => total + value, 0) : null,
    costStatus: costs.length ? "available" : "unavailable",
  };
}

export function summarizeFeedback(records: FeedbackRecord[]): FeedbackSummary {
  const byKind: Record<string, number> = {};
  const byRating: Record<string, number> = {};
  for (const record of records) {
    byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    byRating[record.rating] = (byRating[record.rating] ?? 0) + 1;
  }
  return { total: records.length, byKind, byRating };
}

export function percentile50(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}
