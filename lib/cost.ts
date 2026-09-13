import { readFileSync } from "node:fs";
import path from "node:path";

export interface RateCard {
  asOf: string;
  currency: "USD";
  promptUsdPerMillion: number;
  completionUsdPerMillion: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export function loadRateCard(projectRoot = process.cwd()): RateCard {
  const payload = JSON.parse(readFileSync(path.join(projectRoot, "data", "evaluation", "rate-card.json"), "utf8")) as RateCard;
  if (typeof payload.asOf !== "string" || !payload.asOf) throw new Error("Rate card must declare asOf.");
  if (payload.currency !== "USD") throw new Error("Rate card currency must be USD.");
  if (!Number.isFinite(payload.promptUsdPerMillion) || !Number.isFinite(payload.completionUsdPerMillion)) throw new Error("Rate card token prices are invalid.");
  return payload;
}

export function estimateCostUsd(usage: TokenUsage, card: RateCard): number {
  return (usage.promptTokens * card.promptUsdPerMillion + usage.completionTokens * card.completionUsdPerMillion) / 1_000_000;
}

export function readProviderUsage(payload: { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }): TokenUsage | null {
  const prompt = payload.usage?.prompt_tokens;
  const completion = payload.usage?.completion_tokens;
  if (typeof prompt !== "number" || typeof completion !== "number" || !Number.isFinite(prompt) || !Number.isFinite(completion)) return null;
  return { promptTokens: prompt, completionTokens: completion };
}
