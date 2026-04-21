import type { FormEvent } from "react";
import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type { Citation, Message, ReasoningStep } from "@/components/rag/chat/types";

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

function toRecentTimestampLabel() {
  return new Date().toISOString();
}

const BACKEND_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL?.trim() || "http://localhost:8000";
const DEFAULT_PROCESSING_STEPS: Array<Pick<ReasoningStep, "step" | "title" | "detail">> = [
  {
    step: 1,
    title: "Thinking",
    detail: "Understanding your question and preparing retrieval query.",
  },
  {
    step: 2,
    title: "Chunking",
    detail: "Parsing uploaded document and preparing semantic chunks.",
  },
  {
    step: 3,
    title: "Searching",
    detail: "Running hybrid retrieval and ranking the best evidence.",
  },
  {
    step: 4,
    title: "Answering",
    detail: "Synthesizing final response grounded in citations.",
  },
];

function toAbsoluteDocumentUrl(url: string): string {
  if (!url) {
    return "";
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const normalizedBase = BACKEND_API_URL.replace(/\/$/, "");
  const normalizedPath = url.startsWith("/") ? url : `/${url}`;
  return `${normalizedBase}${normalizedPath}`;
}

function resolveDisplayFilename(rawSource: string, documentId: string, fallback: string): string {
  const normalized = rawSource.trim();
  if (!normalized) {
    return fallback;
  }
  const isHashLike = /^[a-f0-9]{16,64}$/i.test(normalized);
  if (normalized === documentId || isHashLike) {
    return fallback;
  }
  return normalized;
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
  loadConversation: (chatId: string) => Promise<void>;
  submitPrompt: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  dispose: () => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  uploadedFile: null,
  uploadedFileName: "security-policy.pdf",
  prompt: "",
  messages: [],

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
    set({ messages: [] });
  },

  loadConversation: async (chatId) => {
    if (!chatId || chatId === "new") {
      set({ messages: [] });
      return;
    }
    try {
      const response = await fetch(
        `${BACKEND_API_URL}/api/v1/rag/chats/${encodeURIComponent(chatId)}/messages`,
      );
      if (!response.ok) {
        throw new Error("Failed to load conversation");
      }
      const payload = (await response.json()) as {
        messages?: Array<{
          role?: unknown;
          content?: unknown;
          citations?: Array<{
            citation_id?: unknown;
            document_id?: unknown;
            source_filename?: unknown;
            page_number?: unknown;
            pdf_link_with_page?: unknown;
            content?: unknown;
            score?: unknown;
          }> | unknown;
        }>;
      };
      const history: Message[] = Array.isArray(payload.messages)
        ? payload.messages
            .map((entry) => {
              if (!entry || typeof entry !== "object") {
                return null;
              }
              const role = entry.role === "user" ? "user" : entry.role === "assistant" ? "assistant" : null;
              const content = typeof entry.content === "string" ? entry.content : "";
              if (!role || !content) {
                return null;
              }
              const citations: Citation[] | undefined =
                role === "assistant" && Array.isArray(entry.citations)
                  ? entry.citations.map((citation) => {
                      if (!citation || typeof citation !== "object") {
                        return {
                          citationId: null,
                          documentId: "unknown",
                          sourceFilename: "unknown",
                          pageNumber: null,
                          pdfLinkWithPage: "",
                          content: "",
                          score: null,
                        };
                      }
                      const citationId: number | null =
                        "citation_id" in citation && typeof citation.citation_id === "number"
                          ? citation.citation_id
                          : null;
                      const pageNumber: number | null =
                        "page_number" in citation && typeof citation.page_number === "number"
                          ? citation.page_number
                          : null;
                      const score: number | null =
                        "score" in citation && typeof citation.score === "number"
                          ? citation.score
                          : null;
                      const documentId =
                        "document_id" in citation && typeof citation.document_id === "string"
                          ? citation.document_id
                          : "unknown";
                      const sourceFilename =
                        "source_filename" in citation && typeof citation.source_filename === "string"
                          ? citation.source_filename
                          : documentId;
                      const pdfLinkWithPage =
                        "pdf_link_with_page" in citation && typeof citation.pdf_link_with_page === "string"
                          ? toAbsoluteDocumentUrl(citation.pdf_link_with_page)
                          : "";
                      const citationContent =
                        "content" in citation && typeof citation.content === "string"
                          ? citation.content
                          : "";
                      return {
                        citationId,
                        documentId,
                        sourceFilename: resolveDisplayFilename(sourceFilename, documentId, sourceFilename),
                        pageNumber,
                        pdfLinkWithPage,
                        content: citationContent,
                        score,
                      };
                    })
                  : undefined;
              return { id: uuidv4(), role, content, citations } satisfies Message;
            })
            .filter((message): message is Message => message !== null)
        : [];
      set({ messages: history });
    } catch {
      set({
        messages: [
          {
            id: uuidv4(),
            role: "assistant",
            content: "Unable to load this conversation right now.",
          },
        ],
      });
    }
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
    const activeChat = useSidebarStore.getState().activeChat;

    const resolvedChatId = activeChat.id === "new" ? `chat-${userId}` : activeChat.id;
    useSidebarStore.getState().upsertRecentChat({
      id: resolvedChatId,
      title: userContent.length > 64 ? `${userContent.slice(0, 64).trimEnd()}...` : userContent,
      source: uploadedFile.name || uploadedFileName || "No document uploaded",
      updatedAt: toRecentTimestampLabel(),
      status: "ready",
      messages: Math.max(activeChat.messages + 1, 1),
    });

    set({ prompt: "" });
    set((s) => ({
      messages: [
        ...s.messages,
        { id: userId, role: "user" as const, content: userContent },
        {
          id: assistantId,
          role: "assistant" as const,
          content: "",
          isStreaming: true,
          reasoningSteps: DEFAULT_PROCESSING_STEPS.map((step, index) => ({
            ...step,
            status: index === 0 ? "in_progress" : "pending",
          })),
        },
      ],
    }));

    let activeStep = 0;
    const progressTimer = setInterval(() => {
      activeStep = Math.min(activeStep + 1, DEFAULT_PROCESSING_STEPS.length - 1);
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== assistantId) {
            return m;
          }
          return {
            ...m,
            reasoningSteps: DEFAULT_PROCESSING_STEPS.map((step, index) => ({
              ...step,
              status:
                index < activeStep
                  ? "completed"
                  : index === activeStep
                    ? "in_progress"
                    : "pending",
            })),
          };
        }),
      }));
    }, 900);

    try {
      const formData = new FormData();
      formData.append("question", userContent);
      formData.append("file", uploadedFile, uploadedFile.name);
      formData.append("chat_id", resolvedChatId);

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
        citations?: Array<{
          citation_id?: unknown;
          document_id?: unknown;
          source_filename?: unknown;
          page_number?: unknown;
          pdf_link_with_page?: unknown;
          content?: unknown;
          score?: unknown;
        }> | unknown;
        reasoning_steps?: Array<{ step?: unknown; title?: unknown; detail?: unknown }> | unknown;
      };

      const answer = typeof payload.answer === "string" ? payload.answer : "";
      const reasoning = typeof payload.reasoning === "string" ? payload.reasoning : "";
      const citations: Citation[] = Array.isArray(payload.citations)
        ? payload.citations.map((citation) => {
            if (!citation || typeof citation !== "object") {
              return {
                citationId: null,
                documentId: fallbackCitation,
                sourceFilename: fallbackCitation,
                pageNumber: null,
                pdfLinkWithPage: "",
                content: fallbackCitation,
                score: null,
              };
            }
            const citationId: number | null =
              "citation_id" in citation && typeof citation.citation_id === "number"
                ? citation.citation_id
                : null;
            const pageNumber: number | null =
              "page_number" in citation && typeof citation.page_number === "number"
                ? citation.page_number
                : null;
            const score: number | null =
              "score" in citation && typeof citation.score === "number"
                ? citation.score
                : null;
            const documentId =
              "document_id" in citation && typeof citation.document_id === "string"
                ? citation.document_id
                : fallbackCitation;
            const sourceFilename =
              "source_filename" in citation && typeof citation.source_filename === "string"
                ? citation.source_filename
                : fallbackCitation;
            const pdfLinkWithPage =
              "pdf_link_with_page" in citation && typeof citation.pdf_link_with_page === "string"
                ? toAbsoluteDocumentUrl(citation.pdf_link_with_page)
                : "";
            const content =
              "content" in citation && typeof citation.content === "string"
                ? citation.content
                : fallbackCitation;
            return {
              citationId,
              documentId,
              sourceFilename: resolveDisplayFilename(sourceFilename, documentId, fallbackCitation),
              pageNumber,
              pdfLinkWithPage,
              content,
              score,
            };
          })
        : [
            {
              citationId: null,
              documentId: fallbackCitation,
              sourceFilename: fallbackCitation,
              pageNumber: null,
              pdfLinkWithPage: "",
              content: fallbackCitation,
              score: null,
            },
          ];
      const dedupedCitations = citations.filter((citation, index, arr) => {
        const key = `${citation.sourceFilename.toLowerCase()}::${citation.pageNumber ?? "na"}`;
        return index === arr.findIndex((item) => `${item.sourceFilename.toLowerCase()}::${item.pageNumber ?? "na"}` === key);
      });

      const reasoningSteps: ReasoningStep[] = Array.isArray(payload.reasoning_steps)
        ? payload.reasoning_steps
            .map((entry, index) => {
              if (!entry || typeof entry !== "object") {
                return null;
              }
              const step = typeof entry.step === "number" ? entry.step : index + 1;
              const title = typeof entry.title === "string" ? entry.title.trim() : "";
              const detail = typeof entry.detail === "string" ? entry.detail.trim() : "";
              if (!title || !detail) {
                return null;
              }
              return { step, title, detail };
            })
            .filter((entry): entry is ReasoningStep => Boolean(entry))
        : [];

      const fullReply = answer;
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
            ? {
                ...m,
                content: accumulated,
                isStreaming: false,
                citations: dedupedCitations,
                reasoningSteps:
                  reasoningSteps.length > 0 && reasoning
                    ? [
                        ...reasoningSteps.slice(0, -1),
                        {
                          ...reasoningSteps[reasoningSteps.length - 1],
                          detail: reasoning,
                          status: "completed",
                        },
                      ].map((entry) => ({ ...entry, status: "completed" }))
                    : (reasoningSteps.length > 0
                        ? reasoningSteps.map((entry) => ({ ...entry, status: "completed" }))
                        : DEFAULT_PROCESSING_STEPS.map((entry) => ({ ...entry, status: "completed" }))),
              }
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
      clearInterval(progressTimer);
      if (streamAbortController === controller) {
        setStreamController(null);
      }
    }
  },
}));
