import { resolveSession } from "../../../lib/auth";
import { getCorpusService } from "../../../lib/corpus/service";
import { FeedbackRequestError, newFeedbackRecord, parseFeedbackRequest } from "../../../lib/feedback";
import { newOperationalEvent } from "../../../lib/observability";
import { securitySecret } from "../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = parseFeedbackRequest(await request.json());
    const service = await getCorpusService();
    const record = newFeedbackRecord(securitySecret(), input, resolveSession(request).role);
    await Promise.resolve(service.recordFeedback(record));
    await Promise.resolve(service.recordOperationalEvent(newOperationalEvent({
      kind: "feedback",
      outcome: `${record.kind}_${record.rating}`,
      latencyMs: null,
      errorClass: "none",
      citationCount: 0,
      estimatedCostUsd: null,
    })));
    return Response.json({ id: record.id, createdAt: record.createdAt, kind: record.kind, rating: record.rating, surface: record.surface }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof FeedbackRequestError ? error.status : 400;
    return Response.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status });
  }
}
