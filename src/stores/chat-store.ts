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
    const userId = uuidv4();
    const assistantId = uuidv4();
    const citation = uploadedFile?.name || uploadedFileName || "No document selected";

    set({ prompt: "" });
    set((s) => ({
      messages: [
        ...s.messages,
        { id: userId, role: "user" as const, content: userContent },
        { id: assistantId, role: "assistant" as const, content: "", isStreaming: true },
      ],
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userContent,
          uploadedFileName: uploadedFile?.name || uploadedFileName || null,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `Request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          accumulated += decoder.decode(value, { stream: true });
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantId ? { ...m, content: accumulated } : m,
            ),
          }));
        }
        if (done) {
          accumulated += decoder.decode();
          break;
        }
      }

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId
            ? { ...m, content: accumulated, isStreaming: false, citations: [citation] }
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
