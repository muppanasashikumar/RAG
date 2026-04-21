import type { FormEvent } from "react";
import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

import { starterMessages } from "@/components/rag";
import type { Message } from "@/components/rag/chat/types";

import { useSidebarStore } from "@/stores/sidebar-store";

let streamAbortController: AbortController | null = null;

function setStreamController(controller: AbortController | null) {
  streamAbortController = controller;
}

function abortInFlightStream() {
  streamAbortController?.abort();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BACKEND_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL?.trim() || "http://localhost:8000";

type ChatState = {
  uploadedFile: File | null;
  uploadedFileName: string;
  prompt: string;
  messages: Message[];
  setUploadedFile: (file: File | null) => void;
  setPrompt: (prompt: string) => void;
  stopStreaming: () => void;
  newChat: () => void;
  submitPrompt: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  dispose: () => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  uploadedFile: null,
  uploadedFileName: "security-policy.pdf",
  prompt: "",
  messages: starterMessages,

  setUploadedFile: (uploadedFile) =>
    set({
      uploadedFile,
      uploadedFileName: uploadedFile?.name ?? "",
    }),
  setPrompt: (prompt) => set({ prompt }),

  stopStreaming: () => {
    abortInFlightStream();
  },

  dispose: () => {
    abortInFlightStream();
    setStreamController(null);
  },

  newChat: () => {
    abortInFlightStream();
    setStreamController(null);
    const { uploadedFileName } = get();
    useSidebarStore.getState().setActiveChat({
      id: "new",
      title: "Untitled document chat",
      source: uploadedFileName || "No document uploaded",
      updatedAt: "Now",
      status: "ready",
      messages: 0,
    });
    set({ messages: [starterMessages[0]] });
  },

  submitPrompt: async (event) => {
    event.preventDefault();

    const { prompt, messages, uploadedFile, uploadedFileName } = get();
    const isReplyStreaming = messages.some((m) => m.role === "assistant" && m.isStreaming);

    if (!prompt.trim() || isReplyStreaming) {
      return;
    }

    abortInFlightStream();
    const controller = new AbortController();
    setStreamController(controller);

    const userContent = prompt.trim();
    if (!uploadedFile) {
      set((s) => ({
        messages: [
          ...s.messages,
          { id: uuidv4(), role: "assistant", content: "Upload a PDF file before asking a question." },
        ],
      }));
      return;
    }

    const userId = uuidv4();
    const assistantId = uuidv4();
    const fallbackCitation = uploadedFile.name || uploadedFileName || "No document selected";

    set({ prompt: "" });
    set((s) => ({
      messages: [
        ...s.messages,
        { id: userId, role: "user" as const, content: userContent },
        { id: assistantId, role: "assistant" as const, content: "", isStreaming: true },
      ],
    }));

    try {
      const formData = new FormData();
      formData.append("question", userContent);
      formData.append("file", uploadedFile, uploadedFile.name);

      const response = await fetch(`${BACKEND_API_URL}/api/v1/rag/query`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `Request failed (${response.status})`);
      }

      const payload = (await response.json()) as {
        answer?: unknown;
        reasoning?: unknown;
        citations?:
          | Array<{ citation_id?: unknown; page_number?: unknown; score?: unknown }>
          | unknown;
      };

      const answer = typeof payload.answer === "string" ? payload.answer : "";
      const reasoning = typeof payload.reasoning === "string" ? payload.reasoning : "";
      const citations = Array.isArray(payload.citations)
        ? payload.citations.map((citation) => {
            if (!citation || typeof citation !== "object") {
              return fallbackCitation;
            }
            const citationId =
              "citation_id" in citation && typeof citation.citation_id === "number"
                ? citation.citation_id
                : null;
            const pageNumber =
              "page_number" in citation && typeof citation.page_number === "number"
                ? citation.page_number
                : null;
            const score =
              "score" in citation && typeof citation.score === "number"
                ? citation.score
                : null;

            const idPart = citationId ? `[${citationId}]` : "[?]";
            const pagePart = pageNumber ? `p.${pageNumber}` : "p.?";
            const scorePart = score !== null ? `${Math.round(score * 100)}%` : "n/a";
            return `${idPart} ${pagePart} (${scorePart})`;
          })
        : [fallbackCitation];

      const fullReply = reasoning ? `${answer}\n\nReasoning:\n${reasoning}` : answer;
      const tokens = fullReply.match(/\S+\s*/g) ?? [fullReply];
      let accumulated = "";

      for (const token of tokens) {
        if (controller.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        accumulated += token;
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, content: accumulated } : m,
          ),
        }));
        await sleep(token.trim() ? 28 : 0);
      }

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId
            ? { ...m, content: accumulated, isStreaming: false, citations }
            : m,
        ),
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: m.content
                    ? `${m.content}\n\n(Stopped.)`
                    : "Stopped before any tokens arrived.",
                  isStreaming: false,
                }
              : m,
          ),
        }));
        return;
      }

      const fallback =
        error instanceof Error ? error.message : "Something went wrong while streaming the reply.";
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content || fallback, isStreaming: false, citations: m.citations }
            : m,
        ),
      }));
    } finally {
      if (streamAbortController === controller) {
        setStreamController(null);
      }
    }
  },
}));
