import { streamAnswer, type AnswerInput, type AnswerStreamEvent } from "../../../lib/answer";
import { resolveSession } from "../../../lib/auth";
import type { Language, RetrievalMode } from "../../../lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const encoder = new TextEncoder();

export async function POST(request: Request) {
  let input: AnswerInput;
  try { input = validateInput(await request.json() as Record<string, unknown>, resolveSession(request).role); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Invalid request." }, { status: 400 }); }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamAnswer(input)) controller.enqueue(toSse(event));
      } catch (error) {
        controller.enqueue(toSse({ event: "error", data: error instanceof Error ? error.message : "The answer could not be generated." }));
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

function validateInput(body: Record<string, unknown>, role: AnswerInput["role"]): AnswerInput {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) throw new Error("Ask a question first.");
  if (question.length > 1_500) throw new Error("Questions must be 1,500 characters or fewer.");
  if (body.mode !== "keyword" && body.mode !== "semantic") throw new Error("Choose a retrieval strategy.");
  if (body.language !== "en" && body.language !== "th") throw new Error("Choose a supported language.");
  return { question, mode: body.mode as RetrievalMode, language: body.language as Language, role };
}

function toSse(event: AnswerStreamEvent): Uint8Array {
  return encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
}
