import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatInputStore } from "@/stores/chat-input-store";
import { useChatMessagesStore } from "@/stores/chat-messages-store";
import { useChatStreamingStore } from "@/stores/chat-streaming-store";
import { useChatUploadStore } from "@/stores/chat-upload-store";
import { useSidebarStore } from "@/stores/sidebar-store";

let uuidCounter = 0;
vi.mock("uuid", () => ({
  v4: () => `uuid-${++uuidCounter}`,
}));

const initialInputState = useChatInputStore.getState();
const initialMessagesState = useChatMessagesStore.getState();
const initialUploadState = useChatUploadStore.getState();
const initialSidebarState = useSidebarStore.getState();

function fakeFormEvent() {
  return { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>;
}

function streamedSseResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("chat split stores", () => {
  beforeEach(() => {
    uuidCounter = 0;
    useChatInputStore.setState(initialInputState, true);
    useChatMessagesStore.setState(initialMessagesState, true);
    useChatUploadStore.setState(initialUploadState, true);
    useSidebarStore.setState(initialSidebarState, true);
    useChatStreamingStore.getState().disposeAllStreams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useChatStreamingStore.getState().disposeAllStreams();
  });

  it("newChat resets transcript and keeps uploaded source label", () => {
    useChatUploadStore.setState({ uploadedFileNames: ["deck.pdf"] });
    useChatMessagesStore.setState({
      messages: [{ id: "x", role: "assistant", content: "old" }],
    });

    useChatMessagesStore.getState().newChat();

    expect(useChatMessagesStore.getState().messages).toEqual([]);
    expect(useSidebarStore.getState().activeChat).toMatchObject({
      id: "new",
      title: "Untitled document chat",
      source: "deck.pdf",
    });
  });

  it("submitPrompt no-ops when prompt is blank", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    useChatInputStore.setState({ prompt: "   " });

    await useChatMessagesStore.getState().submitPrompt(fakeFormEvent());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useChatMessagesStore.getState().messages).toEqual([]);
  });

  it("submitPrompt streams assistant response and metadata", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedSseResponse([
        'data: {"type":"token","content":"Hello "}\n\n',
        'data: {"type":"token","content":"world"}\n\n',
        'data: {"type":"citations","retrieval_mode":"hybrid","citations":[{"citation_id":1,"document_id":"doc-1","source_filename":"doc.pdf","page_number":2,"pdf_link_with_page":"/files/doc.pdf#page=2","content":"hello","score":0.95}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );

    useChatInputStore.setState({ prompt: "What does it say?" });
    useChatUploadStore.setState({
      uploadedFileNames: ["doc.pdf"],
      uploadedFiles: [new File(["x"], "doc.pdf", { type: "application/pdf" })],
    });

    await useChatMessagesStore.getState().submitPrompt(fakeFormEvent());

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/api/v1/chat/stream");
    expect((init as RequestInit).method).toBe("POST");
    const body = (init as RequestInit).body as FormData;
    expect(body.get("response_language")).toBe("auto");
    expect(useChatInputStore.getState().prompt).toBe("");

    const [userMessage, assistantMessage] = useChatMessagesStore.getState().messages;
    expect(userMessage).toMatchObject({ role: "user", content: "What does it say?" });
    expect(assistantMessage).toMatchObject({
      role: "assistant",
      content: "Hello world",
      isStreaming: false,
      retrievalMode: "hybrid",
    });
    expect(assistantMessage.citations).toHaveLength(1);
    expect(assistantMessage.citations?.[0]).toMatchObject({
      sourceFilename: "doc.pdf",
      pageNumber: 2,
    });
  });

  it("normalizes citation filename and page number from stream payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamedSseResponse([
        'data: {"type":"token","content":"Answer"}\n\n',
        'data: {"type":"citations","retrieval_mode":"hybrid","citations":[{"citation_id":1,"document_id":"uploads/documents/transformer_notes.pdf","source_filename":"89af3ce8c57f3ef6d1234a56","page_number":"3","pdf_link_with_page":"/files/transformer_notes.pdf#page=3","content":"excerpt","score":0.71}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );

    useChatInputStore.setState({ prompt: "Explain transformer" });
    await useChatMessagesStore.getState().submitPrompt(fakeFormEvent());

    const assistantMessage = useChatMessagesStore
      .getState()
      .messages.find((message) => message.role === "assistant");
    expect(assistantMessage?.citations?.[0]).toMatchObject({
      sourceFilename: "transformer_notes.pdf",
      pageNumber: 3,
      pdfLinkWithPage: expect.stringContaining("#page=3"),
    });
  });

  it("stopStreamingForChat appends stopped marker", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_, init) =>
        new Promise((_, reject) => {
          (init as RequestInit).signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    useChatInputStore.setState({ prompt: "long question" });
    const pending = useChatMessagesStore.getState().submitPrompt(fakeFormEvent());
    const activeChatId = useSidebarStore.getState().activeChat.id;

    useChatStreamingStore
      .getState()
      .stopStreamingForChat(activeChatId, useChatMessagesStore.setState);

    await pending;

    const assistant = useChatMessagesStore
      .getState()
      .messages.find((message) => message.role === "assistant");
    expect(assistant?.isStreaming).toBe(false);
    expect(assistant?.content).toContain("Stopped");
  });

  it("allows parallel streams across different chats", async () => {
    let firstRequestUnblock: (() => void) | null = null;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const body = (init as RequestInit).body as FormData;
      const chatId = String(body.get("chat_id"));

      if (chatId === "chat-first") {
        return new Promise<Response>((resolve) => {
          firstRequestUnblock = () => {
            resolve(
              streamedSseResponse([
                'data: {"type":"token","content":"First done"}\n\n',
                "data: [DONE]\n\n",
              ]),
            );
          };
        });
      }

      return Promise.resolve(
        streamedSseResponse([
          'data: {"type":"token","content":"Second done"}\n\n',
          "data: [DONE]\n\n",
        ]),
      );
    });

    useSidebarStore.setState({
      activeChat: { ...useSidebarStore.getState().activeChat, id: "chat-first" },
    });
    useChatInputStore.setState({ prompt: "first user" });
    const firstSubmit = useChatMessagesStore.getState().submitPrompt(fakeFormEvent());

    useSidebarStore.setState({
      activeChat: { ...useSidebarStore.getState().activeChat, id: "chat-second" },
    });
    useChatMessagesStore.setState({ messages: [] });
    useChatInputStore.setState({ prompt: "second user" });
    await useChatMessagesStore.getState().submitPrompt(fakeFormEvent());

    firstRequestUnblock?.();
    await firstSubmit;

    const firstChatController = useChatStreamingStore.getState().hasActiveController("chat-first");
    const secondChatController = useChatStreamingStore.getState().hasActiveController("chat-second");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(firstChatController).toBe(false);
    expect(secondChatController).toBe(false);
  });
});
