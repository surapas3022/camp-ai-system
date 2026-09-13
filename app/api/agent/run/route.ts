import { AgentRequestError, getAgentCoordinator, parseAgentRunRequest } from "../../../../lib/agent";
import { resolveSession } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = parseAgentRunRequest(await request.json());
    const workspace = await (await getAgentCoordinator()).run({ ...input, role: resolveSession(request).role });
    return Response.json(workspace, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status: error instanceof AgentRequestError ? error.status : 400 });
  }
}
