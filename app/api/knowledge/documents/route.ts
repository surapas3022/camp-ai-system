import { getCorpusService } from "../../../../lib/corpus/service";
import { resolveSession } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const service = await getCorpusService();
  return Response.json({ corpus: service.manifest, documents: await Promise.resolve(service.listDocuments(resolveSession(request).role)) }, { headers: { "Cache-Control": "no-store" } });
}
