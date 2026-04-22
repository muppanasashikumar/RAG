import type { FormEvent } from "react";
import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type {
  Citation,
  Message,
  ReasoningStep,
  UploadStatusItem,
} from "@/components/rag/chat/types";

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

function buildBackendUrl(path: string): string {
  return `${BACKEND_API_URL.replace(/\/$/, "")}${path}`;
}

type ChatState = {
  uploadedFiles: File[];
  uploadedFileNames: string[];
  uploadStatuses: UploadStatusItem[];
  isBatchUploading: boolean;
  prompt: string;
  messages: Message[];
  uploadBatchFiles: (files: File[]) => Promise<void>;
  clearUploadedFiles: () => void;
  setPrompt: (prompt: string) => void;
  stopStreaming: () => void;
  newChat: () => void;
  loadConversation: (chatId: string) => Promise<void>;
  submitPrompt: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  dispose: () => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  uploadedFiles: [],
  uploadedFileNames: [],
  uploadStatuses: [],
  isBatchUploading: false,
  prompt: "",
  messages: [],

  uploadBatchFiles: async (files) => {
    if (files.length === 0) {
      set({ uploadedFiles: [], uploadedFileNames: [], uploadStatuses: [] });
      return;
    }

    const initialStatuses: UploadStatusItem[] = files.map((file) => ({
      fileName: file.name,
      status: "queued",
    }));
    set({ isBatchUploading: true, uploadStatuses: initialStatuses });
    try {
      const successfulFiles: File[] = [];
      const successfulFileNames: string[] = [];
      for (const file of files) {
        set((state) => ({
          uploadStatuses: state.uploadStatuses.map((entry) =>
            entry.fileName === file.name ? { ...entry, status: "ingesting", error: undefined } : entry,
          ),
        }));
        const formData = new FormData();
        formData.append("file", file, file.name);
        const response = await fetch(buildBackendUrl("/ingest"), {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const errorMessage = detail || `Failed to ingest ${file.name} (${response.status})`;
          set((state) => ({
            uploadStatuses: state.uploadStatuses.map((entry) =>
              entry.fileName === file.name
                ? { ...entry, status: "failed", error: errorMessage }
                : entry,
            ),
          }));
          throw new Error(errorMessage);
        }

        const payload = (await response.json().catch(() => null)) as
          | { chunks_ingested?: unknown; message?: unknown }
          | null;
        const chunksIngested =
          payload && typeof payload.chunks_ingested === "number" ? payload.chunks_ingested : null;
        if (chunksIngested !== null && chunksIngested <= 0) {
          const errorMessage =
            payload && typeof payload.message === "string" && payload.message.trim()
              ? payload.message
              : `No searchable text was extracted from ${file.name}.`;
          set((state) => ({
            uploadStatuses: state.uploadStatuses.map((entry) =>
              entry.fileName === file.name
                ? { ...entry, status: "failed", error: errorMessage }
                : entry,
            ),
          }));
          throw new Error(errorMessage);
        }

        successfulFiles.push(file);
        successfulFileNames.push(file.name);
        set((state) => ({
          uploadedFiles: successfulFiles,
          uploadedFileNames: successfulFileNames,
          uploadStatuses: state.uploadStatuses.map((entry) =>
            entry.fileName === file.name ? { ...entry, status: "indexed", error: undefined } : entry,
          ),
        }));
      }
    } finally {
      set({ isBatchUploading: false });
    }
  },
  clearUploadedFiles: () => set({ uploadedFiles: [], uploadedFileNames: [], uploadStatuses: [] }),
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
    const { uploadedFileNames } = get();
    const sourceLabel = uploadedFileNames.length > 0 ? uploadedFileNames[0] : "No document uploaded";
    useSidebarStore.getState().setActiveChat({
      id: "new",
      title: "Untitled document chat",
      source: sourceLabel,
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

    const { prompt, messages, uploadedFileNames, uploadedFiles } = get();
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
    const fallbackCitation = uploadedFileNames[0] || "Indexed documents";
    const activeChat = useSidebarStore.getState().activeChat;

    const resolvedChatId = activeChat.id === "new" ? `chat-${userId}` : activeChat.id;
    useSidebarStore.getState().upsertRecentChat({
      id: resolvedChatId,
      title: userContent.length > 64 ? `${userContent.slice(0, 64).trimEnd()}...` : userContent,
      source: uploadedFileNames[0] || "Indexed documents",
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
      const selectedFileName = uploadedFileNames[0];
      const selectedFile = uploadedFiles[0];
      const formData = new FormData();
      formData.append("query", userContent);
      if (selectedFile) {
        formData.append("file", selectedFile, selectedFile.name);
      }
      const response = await fetch(buildBackendUrl("/chat/stream"), {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `Request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error("No response stream from backend.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = "";
      let accumulated = "";
      let streamedCitations: Citation[] = [];
      let streamedRetrievalMode: Message["retrievalMode"] | undefined;

      const toCitations = (rawCitations: unknown): Citation[] => {
        if (!Array.isArray(rawCitations)) {
          return [];
        }
        return rawCitations.map((citation) => {
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
        });
      };

      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) {
          break;
        }
        streamBuffer += decoder.decode(value, { stream: true });
        const events = streamBuffer.split("\n\n");
        streamBuffer = events.pop() ?? "";

        for (const event of events) {
          const dataLines = event
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6));
          if (dataLines.length === 0) {
            continue;
          }
          const eventData = dataLines.join("\n").trim();
          if (eventData === "[DONE]") {
            done = true;
            break;
          }
          let parsed:
            | { type?: unknown; content?: unknown; citations?: unknown; retrieval_mode?: unknown }
            | null = null;
          try {
            parsed = JSON.parse(eventData) as { type?: unknown; content?: unknown; citations?: unknown };
          } catch {
            continue;
          }
          if (parsed?.type === "token" && typeof parsed.content === "string") {
            accumulated += parsed.content;
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m,
              ),
            }));
          }
          if (parsed?.type === "citations") {
            streamedCitations = toCitations(parsed.citations);
            if (
              parsed.retrieval_mode === "vector" ||
              parsed.retrieval_mode === "fallback" ||
              parsed.retrieval_mode === "none"
            ) {
              streamedRetrievalMode = parsed.retrieval_mode;
            }
          }
        }
      }

      const dedupedCitations = streamedCitations.filter((citation, index, arr) => {
        const key = `${citation.sourceFilename.toLowerCase()}::${citation.pageNumber ?? "na"}`;
        return (
          index ===
          arr.findIndex((item) => `${item.sourceFilename.toLowerCase()}::${item.pageNumber ?? "na"}` === key)
        );
      });

      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: accumulated,
                isStreaming: false,
                citations: dedupedCitations,
                retrievalMode: streamedRetrievalMode,
                reasoningSteps: DEFAULT_PROCESSING_STEPS.map((entry) => ({ ...entry, status: "completed" })),
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
