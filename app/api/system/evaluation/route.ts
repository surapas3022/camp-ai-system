import { resolveSession } from "../../../../lib/auth";
import { getCorpusService } from "../../../../lib/corpus/service";
import { buildDashboard, EvaluationRequestError, parseEvaluationRunRequest, runEvaluationSuite } from "../../../../lib/evaluation";
import { securitySecret } from "../../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (resolveSession(request).role !== "staff") return Response.json({ error: "Staff access is required." }, { status: 403 });
  return Response.json(await buildDashboard(await getCorpusService()), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (resolveSession(request).role !== "staff") return Response.json({ error: "Staff access is required." }, { status: 403 });
  try {
    const input = parseEvaluationRunRequest(await request.json());
    const run = await runEvaluationSuite({
      mode: input.mode,
      service: await getCorpusService(),
      secret: securitySecret(),
    });
    return Response.json(run, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof EvaluationRequestError ? error.status : 400;
    return Response.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status });
  }
}
