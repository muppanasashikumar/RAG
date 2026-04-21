import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

// The route imports NextResponse.json for error responses. Stub it with a
// minimal compatible shape.
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
      }),
  },
}));

import { POST } from "@/app/api/chat/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { value, done } = await reader.read();
    if (value) out += decoder.decode(value, { stream: true });
    if (done) {
      out += decoder.decode();
      break;
    }
  }
  return out;
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when no user is authenticated", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await POST(jsonRequest({ prompt: "hi" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when the body is not valid JSON", async () => {
    authMock.mockResolvedValue({ userId: "user-1" });

    const bad = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const response = await POST(bad);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when the prompt is missing or blank", async () => {
    authMock.mockResolvedValue({ userId: "user-1" });

    const response = await POST(jsonRequest({ prompt: "   " }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "prompt is required" });
  });

  it("streams a plain-text placeholder reply echoing the prompt", async () => {
    authMock.mockResolvedValue({ userId: "user-1" });

    const response = await POST(jsonRequest({ prompt: "hello world" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const text = await readStream(response);
    expect(text).toContain("hello world");
  });

  it("truncates long prompts in the echoed preview", async () => {
    authMock.mockResolvedValue({ userId: "user-1" });
    const longPrompt = "x".repeat(200);
    const response = await POST(jsonRequest({ prompt: longPrompt }));

    const text = await readStream(response);
    expect(text).toContain("…");
    expect(text).not.toContain("x".repeat(200));
  });
});
