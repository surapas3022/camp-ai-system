import { clearSessionCookie, createStaffSession, resolveSession, sessionCookie, verifyStaffPin } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = resolveSession(request);
  return Response.json({ role: session.role, expiresAt: session.expiresAt || null });
}

export async function POST(request: Request) {
  let pin = "";
  try {
    const body = await request.json() as Record<string, unknown>;
    pin = typeof body.pin === "string" ? body.pin : "";
  } catch { return Response.json({ error: "Enter a staff PIN." }, { status: 400 }); }
  if (!pin || pin.length > 256) return Response.json({ error: "Enter a staff PIN." }, { status: 400 });
  try {
    if (!await verifyStaffPin(pin)) return Response.json({ error: "The staff PIN is incorrect." }, { status: 401 });
    const session = createStaffSession();
    return Response.json({ role: "staff", expiresAt: session.expiresAt }, { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt), "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Staff access could not be enabled." }, { status: 500 });
  }
}

export function DELETE() {
  return Response.json({ role: "public" }, { headers: { "Set-Cookie": clearSessionCookie(), "Cache-Control": "no-store" } });
}
