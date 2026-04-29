import { v4 as uuidv4 } from "uuid";

import type {
  Citation,
  Message,
  ReasoningStep,
  UploadStatusItem,
} from "@/components/rag/chat/types";
import type {
  ConversationPayload,
  StoreSetter,
} from "@/stores/chat-store.typings";

const BACKEND_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL?.trim() || "http://localhost:8000";

export const INDEXED_DOCUMENTS_LABEL = "Indexed documents";
const STREAM_STOPPED_MESSAGE = "Stopped before any tokens arrived.";

export const DEFAULT_PROCESSING_STEPS: Array<Pick<ReasoningStep, "step" | "title" | "detail">> = [
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

export function toRecentTimestampLabel() {
  return new Date().toISOString();
}

export function buildBackendUrl(path: string): string {
  const normalizedBase = BACKEND_API_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (normalizedPath.startsWith("/api/v1/") || normalizedPath === "/api/v1") {
    return `${normalizedBase}${normalizedPath}`;
  }
  return `${normalizedBase}/api/v1${normalizedPath}`;
}

export function appendStoppedSuffix(content: string): string {
  return content ? `${content}\n\n(Stopped.)` : STREAM_STOPPED_MESSAGE;
}

export function normalizeRetrievalMode(value: unknown): Message["retrievalMode"] | undefined {
  return value === "vector" ||
    value === "hybrid" ||
    value === "fallback" ||
    value === "general" ||
    value === "none"
    ? value
    : undefined;
}

export function buildReasoningSteps(status: ReasoningStep["status"]): ReasoningStep[] {
  return DEFAULT_PROCESSING_STEPS.map((entry) => ({ ...entry, status }));
}

export function withReasoningProgress(activeStep: number): ReasoningStep[] {
  return DEFAULT_PROCESSING_STEPS.map((step, index) => ({
    ...step,
    status: index < activeStep ? "completed" : index === activeStep ? "in_progress" : "pending",
  }));
}

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

function getFilenameFromPathLike(value: string): string {
  const withoutHash = value.split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  const segments = withoutQuery.split("/").filter(Boolean);
  const candidate = segments[segments.length - 1] ?? "";
  return decodeURIComponent(candidate.trim());
}

function resolveCitationFilename(params: {
  sourceFilename: string;
  documentId: string;
  pdfLinkWithPage: string;
  fallback: string;
}): string {
  const { sourceFilename, documentId, pdfLinkWithPage, fallback } = params;
  const direct = resolveDisplayFilename(sourceFilename, documentId, "");
  if (direct) {
    return direct;
  }
  const fromDocumentId = getFilenameFromPathLike(documentId);
  if (fromDocumentId && fromDocumentId !== documentId) {
    return fromDocumentId;
  }
  const fromUrl = getFilenameFromPathLike(pdfLinkWithPage);
  if (fromUrl) {
    return fromUrl;
  }
  return fallback;
}

export function toNormalizedCitations(rawCitations: unknown, fallback: string): Citation[] {
  if (!Array.isArray(rawCitations)) {
    return [];
  }
  return rawCitations.map((citation) => {
    if (!citation || typeof citation !== "object") {
      return {
        citationId: null,
        documentId: fallback,
        sourceFilename: fallback,
        pageNumber: null,
        pdfLinkWithPage: "",
        content: fallback,
        score: null,
      };
    }
    const citationId: number | null =
      "citation_id" in citation && typeof citation.citation_id === "number" ? citation.citation_id : null;
    const pageNumberRaw = "page_number" in citation ? citation.page_number : null;
    const pageNumber =
      typeof pageNumberRaw === "number"
        ? pageNumberRaw
        : typeof pageNumberRaw === "string" && /^\d+$/.test(pageNumberRaw)
          ? Number.parseInt(pageNumberRaw, 10)
          : null;
    const score: number | null = "score" in citation && typeof citation.score === "number" ? citation.score : null;
    const documentId =
      "document_id" in citation && typeof citation.document_id === "string"
        ? citation.document_id
        : fallback;
    const sourceFilename =
      "source_filename" in citation && typeof citation.source_filename === "string"
        ? citation.source_filename
        : fallback;
    const pdfLinkWithPage =
      "pdf_link_with_page" in citation && typeof citation.pdf_link_with_page === "string"
        ? toAbsoluteDocumentUrl(citation.pdf_link_with_page)
        : "";
    const content =
      "content" in citation && typeof citation.content === "string" ? citation.content : fallback;
    return {
      citationId,
      documentId,
      sourceFilename: resolveCitationFilename({
        sourceFilename,
        documentId,
        pdfLinkWithPage,
        fallback,
      }),
      pageNumber,
      pdfLinkWithPage,
      content,
      score,
    };
  });
}

export function dedupeCitations(citations: Citation[]): Citation[] {
  return citations.filter((citation, index, arr) => {
    const key = `${citation.sourceFilename.toLowerCase()}::${citation.pageNumber ?? "na"}`;
    return index === arr.findIndex((item) => `${item.sourceFilename.toLowerCase()}::${item.pageNumber ?? "na"}` === key);
  });
}

export function toConversationHistory(payload: ConversationPayload): Message[] {
  if (!Array.isArray(payload.messages)) {
    return [];
  }
  return payload.messages
    .map((entry): Message | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const role = entry.role === "user" ? "user" : entry.role === "assistant" ? "assistant" : null;
      const content = typeof entry.content === "string" ? entry.content : "";
      const serverMessageId = typeof entry.message_id === "string" ? entry.message_id : undefined;
      const feedback = entry.feedback === "like" || entry.feedback === "dislike" ? entry.feedback : null;
      if (!role || !content) {
        return null;
      }
      if (role === "assistant" && Array.isArray(entry.citations)) {
        return {
          id: uuidv4(),
          serverMessageId,
          role,
          content,
          feedback,
          citations: toNormalizedCitations(entry.citations, "unknown"),
        };
      }
      return { id: uuidv4(), serverMessageId, role, content };
    })
    .filter((message): message is Message => message !== null);
}

export function updateAssistantInStore<TState extends { messages: Message[] }>(
  set: StoreSetter<TState>,
  matcher: (message: Message) => boolean,
  updater: (message: Message) => Message,
) {
  set((state) => ({
    messages: state.messages.map((message) => (matcher(message) ? updater(message) : message)),
  }) as Partial<TState>);
}

export function markUploadStatus<TState extends { uploadStatuses: UploadStatusItem[] }>(
  set: StoreSetter<TState>,
  fileName: string,
  status: UploadStatusItem["status"],
  detail?: string,
  error?: string,
) {
  set((state) => ({
    uploadStatuses: state.uploadStatuses.map((entry) =>
      entry.fileName === fileName ? { ...entry, status, detail, error } : entry,
    ),
  }) as Partial<TState>);
}
