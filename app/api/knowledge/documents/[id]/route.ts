import { getCorpusService } from "../../../../../lib/corpus/factory";
import { isAuthorized, resolveSession } from "../../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const document = await Promise.resolve((await getCorpusService()).getDocument((await params).id));
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
  if (!isAuthorized(resolveSession(request).role, document.accessLevel)) return Response.json({ error: "Access denied." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return Response.json({ document }, { headers: { "Cache-Control": "no-store" } });
}
