import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { starterMessages } from "@/components/rag";
import { useChatStore } from "@/stores/chat-store";
import { useSidebarStore } from "@/stores/sidebar-store";

let uuidCounter = 0;
vi.mock("uuid", () => ({
  v4: () => `uuid-${++uuidCounter}`,
}));

const initialChatState = useChatStore.getState();
const initialSidebarState = useSidebarStore.getState();

function fakeFormEvent() {
  return { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>;
}

function streamedResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

describe("useChatStore", () => {
  beforeEach(() => {
    uuidCounter = 0;
    useChatStore.setState({ ...initialChatState, messages: [...starterMessages] }, true);
    useSidebarStore.setState(initialSidebarState, true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("setters", () => {
    it("setUploadedFile stores the file and its name", () => {
      const file = new File(["x"], "policy.pdf", { type: "application/pdf" });
      useChatStore.getState().setUploadedFile(file);
      expect(useChatStore.getState().uploadedFile).toBe(file);
      expect(useChatStore.getState().uploadedFileName).toBe("policy.pdf");
    });

    it("setUploadedFile(null) clears the filename", () => {
      useChatStore.getState().setUploadedFile(null);
      expect(useChatStore.getState().uploadedFile).toBeNull();
      expect(useChatStore.getState().uploadedFileName).toBe("");
    });

    it("setPrompt stores the prompt text", () => {
      useChatStore.getState().setPrompt("hello");
      expect(useChatStore.getState().prompt).toBe("hello");
    });
  });

  describe("newChat", () => {
    it("resets the sidebar active chat and clears the transcript to a greeting", () => {
      useChatStore.setState({ uploadedFileName: "deck.pdf" });
      useChatStore.getState().newChat();

      const active = useSidebarStore.getState().activeChat;
      expect(active.id).toBe("new");
      expect(active.title).toBe("Untitled document chat");
      expect(active.source).toBe("deck.pdf");

      const messages = useChatStore.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(starterMessages[0]);
    });

    it("falls back to a helpful source label when no document is uploaded", () => {
      useChatStore.setState({ uploadedFileName: "" });
      useChatStore.getState().newChat();
      expect(useSidebarStore.getState().activeChat.source).toBe(
        "No document uploaded",
      );
    });
  });

  describe("submitPrompt", () => {
    it("is a no-op when the prompt is empty / whitespace", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      useChatStore.setState({ prompt: "   " });

      await useChatStore.getState().submitPrompt(fakeFormEvent());

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(useChatStore.getState().messages).toEqual(starterMessages);
    });

    it("is a no-op when a reply is already streaming", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      useChatStore.setState({
        prompt: "hello",
        messages: [
          ...starterMessages,
          {
            id: "inflight",
            role: "assistant",
            content: "",
            isStreaming: true,
          },
        ],
      });

      await useChatStore.getState().submitPrompt(fakeFormEvent());
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("streams tokens, clears the prompt, and attaches a citation", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(streamedResponse(["Hello ", "world"]));

      useChatStore.setState({
        prompt: "What does it say?",
        uploadedFileName: "doc.pdf",
      });

      await useChatStore.getState().submitPrompt(fakeFormEvent());

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("/api/chat");
      const request = init as RequestInit;
      expect(request.method).toBe("POST");
      expect(JSON.parse(request.body as string)).toEqual({
        prompt: "What does it say?",
        uploadedFileName: "doc.pdf",
      });

      const { messages, prompt } = useChatStore.getState();
      expect(prompt).toBe("");
      const [user, assistant] = messages.slice(-2);
      expect(user).toEqual({
        id: "uuid-1",
        role: "user",
        content: "What does it say?",
      });
      expect(assistant.role).toBe("assistant");
      expect(assistant.isStreaming).toBe(false);
      expect(assistant.content).toBe("Hello world");
      expect(assistant.citations).toEqual(["doc.pdf"]);
    });

    it("shows a friendly message when the response is not ok", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("boom", { status: 500 }),
      );
      useChatStore.setState({ prompt: "ask" });

      await useChatStore.getState().submitPrompt(fakeFormEvent());

      const assistant = useChatStore.getState().messages.at(-1)!;
      expect(assistant.isStreaming).toBe(false);
      expect(assistant.content).toBe("boom");
    });

    it("returns a '(Stopped.)' marker when the stream is aborted mid-flight", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_, init) =>
          new Promise((_, reject) => {
            (init as RequestInit).signal?.addEventListener("abort", () => {
              reject(
                new DOMException("The user aborted a request.", "AbortError"),
              );
            });
          }),
      );

      useChatStore.setState({ prompt: "long question" });
      const pending = useChatStore.getState().submitPrompt(fakeFormEvent());
      useChatStore.getState().stopStreaming();
      await pending;

      const assistant = useChatStore.getState().messages.at(-1)!;
      expect(assistant.isStreaming).toBe(false);
      expect(assistant.content).toContain("Stopped");
    });

    it("starting a new chat aborts any in-flight request", async () => {
      let capturedSignal: AbortSignal | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_, init) =>
          new Promise<Response>((_, reject) => {
            capturedSignal = (init as RequestInit).signal ?? null;
            capturedSignal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      );

      useChatStore.setState({ prompt: "first" });
      const pending = useChatStore.getState().submitPrompt(fakeFormEvent());
      useChatStore.getState().newChat();
      await pending;

      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe("dispose", () => {
    it("aborts any in-flight request and clears the controller", async () => {
      let capturedSignal: AbortSignal | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_, init) =>
          new Promise<Response>((_, reject) => {
            capturedSignal = (init as RequestInit).signal ?? null;
            capturedSignal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      );

      useChatStore.setState({ prompt: "hi" });
      const pending = useChatStore.getState().submitPrompt(fakeFormEvent());
      useChatStore.getState().dispose();
      await pending;

      expect(capturedSignal?.aborted).toBe(true);
    });
  });
});
