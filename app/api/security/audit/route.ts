import { resolveSession } from "../../../../lib/auth";
import { getCorpusService } from "../../../../lib/corpus/factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (resolveSession(request).role !== "staff") return Response.json({ error: "Staff access is required." }, { status: 403 });
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  const limit = Number.isInteger(requested) ? Math.max(1, Math.min(requested, 100)) : 50;
  return Response.json({ events: await Promise.resolve((await getCorpusService()).listAuditEvents(limit)) });
}
