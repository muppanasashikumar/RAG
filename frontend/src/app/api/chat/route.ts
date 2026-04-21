import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const promptValue = formData.get("prompt");
  const prompt = typeof promptValue === "string" ? promptValue.trim() : "";

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const backendBaseUrl = process.env.BACKEND_API_URL?.trim() || "http://localhost:8000";
  const backendFormData = new FormData();
  backendFormData.append("question", prompt);
  backendFormData.append("file", file, file.name);

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${backendBaseUrl}/api/v1/rag/query`, {
      method: "POST",
      body: backendFormData,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Backend is unreachable" }, { status: 502 });
  }

  if (!backendResponse.ok) {
    const detail = await backendResponse.text().catch(() => "");
    return NextResponse.json(
      { error: detail || `Backend request failed (${backendResponse.status})` },
      { status: backendResponse.status },
    );
  }

  const payload = (await backendResponse.json()) as {
    answer?: unknown;
    reasoning?: unknown;
    citations?: Array<{ citation_id?: unknown; page_number?: unknown; score?: unknown }>;
  };

  const answer = typeof payload.answer === "string" ? payload.answer : "";
  const reasoning = typeof payload.reasoning === "string" ? payload.reasoning : "";
  const citationLabels =
    payload.citations?.map((citation) => {
      const citationId = typeof citation.citation_id === "number" ? citation.citation_id : null;
      const pageNumber = typeof citation.page_number === "number" ? citation.page_number : null;
      const score = typeof citation.score === "number" ? citation.score : null;

      const idPart = citationId ? `[${citationId}]` : "[?]";
      const pagePart = pageNumber ? `p.${pageNumber}` : "p.?";
      const scorePart = score !== null ? `${Math.round(score * 100)}%` : "n/a";
      return `${idPart} ${pagePart} (${scorePart})`;
    }) ?? [];

  return NextResponse.json({
    answer,
    reasoning,
    citations: citationLabels,
  });
}
