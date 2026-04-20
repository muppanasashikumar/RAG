import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt =
    typeof body === "object" && body !== null && "prompt" in body && typeof (body as { prompt: unknown }).prompt === "string"
      ? (body as { prompt: string }).prompt.trim()
      : "";

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const preview = prompt.length > 120 ? `${prompt.slice(0, 120)}…` : prompt;
  const fullReply =
    `Here is a streamed placeholder answer for: “${preview}”. ` +
    "Wire this endpoint to your retrieval service and model so tokens arrive here as they are generated, while citations are attached when the run completes.";

  const encoder = new TextEncoder();
  const tokens = fullReply.match(/\S+\s*/g) ?? [fullReply];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const chunk of tokens) {
          controller.enqueue(encoder.encode(chunk));
          await new Promise((resolve) => setTimeout(resolve, chunk.trim() ? 28 : 0));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
