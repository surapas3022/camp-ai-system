import { readFile } from "node:fs/promises";
import { getCorpusService } from "../../../../../../lib/corpus/service";
import { isAuthorized, resolveSession } from "../../../../../../lib/auth";
import { forbiddenPage } from "../../../../../../lib/forbidden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const service = await getCorpusService();
  const id = (await params).id;
  const document = await Promise.resolve(service.getDocument(id));
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
  if (!isAuthorized(resolveSession(request).role, document.accessLevel)) return forbiddenPage();
  const source = await Promise.resolve(service.getSourceFile(id));
  if (!source) return Response.json({ error: "Document not found." }, { status: 404 });
  try {
    return new Response(await readFile(source.path), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${source.filename.replace(/"/gu, "")}"`,
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch { return Response.json({ error: "The seeded source file is unavailable." }, { status: 404 }); }
}
