import { create } from "zustand";

import type { ChatUploadState } from "@/stores/chat-store.typings";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  buildBackendUrl,
  markUploadStatus,
} from "@/stores/chat-store.helpers";

const INGEST_REQUEST_TIMEOUT_MS = 60_000;
const INGEST_JOB_TIMEOUT_MS = 5 * 60_000;

type IngestJobCreateResponse = {
  job_id?: unknown;
  message?: unknown;
};

type IngestJobStatusResponse = {
  job_id?: unknown;
  file?: unknown;
  status?: unknown;
  chunks_ingested?: unknown;
  document_url?: unknown;
  message?: unknown;
  error?: unknown;
  attempts?: unknown;
  max_attempts?: unknown;
  failure_history?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type BackendJobStatus = "queued" | "processing" | "retrying" | "completed" | "failed";

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown; message?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    const detail = await response.text().catch(() => "");
    if (detail.trim()) {
      return detail;
    }
  }
  return fallback;
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toUploadStatusDetail(status: BackendJobStatus): string {
  return status === "queued"
    ? "Queued"
    : status === "processing"
      ? "Processing"
      : status === "retrying"
        ? "Retrying"
        : status === "completed"
          ? "Completed"
          : "Failed";
}

function isBackendJobStatus(value: unknown): value is BackendJobStatus {
  return (
    value === "queued" ||
    value === "processing" ||
    value === "retrying" ||
    value === "completed" ||
    value === "failed"
  );
}

async function streamIngestionJob(
  jobId: string,
  fileName: string,
  onStatusUpdate: (status: BackendJobStatus) => void,
): Promise<IngestJobStatusResponse> {
  const response = await withTimeout(
    (signal) =>
      authenticatedFetch(buildBackendUrl(`/ingest/jobs/${encodeURIComponent(jobId)}/events`), {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
        },
        signal,
      }),
    INGEST_JOB_TIMEOUT_MS,
    `Ingestion timed out for ${fileName}. Please try again.`,
  );
  if (!response.ok) {
    const errorMessage = await extractErrorMessage(
      response,
      `Failed to stream ingestion status for ${fileName} (${response.status})`,
    );
    throw new Error(errorMessage);
  }
  if (!response.body) {
    throw new Error(`No ingestion event stream available for ${fileName}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let streamBuffer = "";
  let latestPayload: IngestJobStatusResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    streamBuffer += decoder.decode(value, { stream: true });
    const events = streamBuffer.split("\n\n");
    streamBuffer = events.pop() ?? "";
    for (const eventChunk of events) {
      const eventLines = eventChunk.split("\n").map((line) => line.trim());
      const eventName = eventLines.find((line) => line.startsWith("event:"))?.slice(6).trim();
      if (eventName === "job-error") {
        const errorLine = eventLines.find((line) => line.startsWith("data:"));
        if (!errorLine) {
          throw new Error(`Ingestion stream failed for ${fileName}.`);
        }
        const raw = errorLine.slice(5).trim();
        let message = `Ingestion stream failed for ${fileName}.`;
        try {
          const parsed = JSON.parse(raw) as { message?: unknown };
          if (typeof parsed.message === "string" && parsed.message.trim()) {
            message = parsed.message;
          }
        } catch {
          // ignore parse failures; use default error
        }
        throw new Error(message);
      }
      if (eventName !== "job-status") {
        continue;
      }
      const dataLines = eventChunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());
      if (dataLines.length === 0) {
        continue;
      }
      const eventData = dataLines.join("\n");
      let payload: IngestJobStatusResponse | null = null;
      try {
        payload = JSON.parse(eventData) as IngestJobStatusResponse;
      } catch {
        continue;
      }
      if (!payload || !isBackendJobStatus(payload.status)) {
        continue;
      }
      latestPayload = payload;
      onStatusUpdate(payload.status);
      if (payload.status === "completed" || payload.status === "failed") {
        return payload;
      }
    }
  }

  if (latestPayload && isBackendJobStatus(latestPayload.status)) {
    if (latestPayload.status === "completed" || latestPayload.status === "failed") {
      return latestPayload;
    }
  }
  throw new Error(`Ingestion stream closed before completion for ${fileName}.`);
}

export const useChatUploadStore = create<ChatUploadState>((set) => ({
  uploadedFiles: [],
  uploadedFileNames: [],
  uploadStatuses: [],
  isBatchUploading: false,

  uploadBatchFiles: async (files) => {
    if (files.length === 0) {
      set({ uploadedFiles: [], uploadedFileNames: [], uploadStatuses: [] });
      return;
    }

    const initialStatuses: ChatUploadState["uploadStatuses"] = files.map((file) => ({
      fileName: file.name,
      status: "queued",
      detail: "Queued",
    }));
    set({ isBatchUploading: true, uploadStatuses: initialStatuses });
    try {
      const successfulFiles: File[] = [];
      const successfulFileNames: string[] = [];
      for (const file of files) {
        markUploadStatus(set, file.name, "ingesting", "Uploading");
        const formData = new FormData();
        formData.append("file", file, file.name);
        const response = await withTimeout(
          (signal) =>
            authenticatedFetch(buildBackendUrl("/ingest/async"), {
              method: "POST",
              body: formData,
              signal,
            }),
          INGEST_REQUEST_TIMEOUT_MS,
          `Ingestion timed out for ${file.name}. Please try again.`,
        );
        if (!response.ok) {
          const errorMessage = await extractErrorMessage(
            response,
            `Failed to ingest ${file.name} (${response.status})`,
          );
          markUploadStatus(set, file.name, "failed", "Failed", errorMessage);
          throw new Error(errorMessage);
        }

        const queuedPayload = (await response.json().catch(() => null)) as IngestJobCreateResponse | null;
        const jobId =
          queuedPayload && typeof queuedPayload.job_id === "string" ? queuedPayload.job_id.trim() : "";
        if (!jobId) {
          const errorMessage = `Ingestion job ID missing for ${file.name}.`;
          markUploadStatus(set, file.name, "failed", "Failed", errorMessage);
          throw new Error(errorMessage);
        }

        markUploadStatus(set, file.name, "ingesting", "Queued");
        const statusPayload = await streamIngestionJob(jobId, file.name, (backendStatus) => {
          if (backendStatus === "failed") {
            return;
          }
          markUploadStatus(set, file.name, "ingesting", toUploadStatusDetail(backendStatus));
        });
        if (statusPayload.status === "failed") {
          const errorMessage =
            typeof statusPayload.error === "string" && statusPayload.error.trim()
              ? statusPayload.error
              : typeof statusPayload.message === "string" && statusPayload.message.trim()
                ? statusPayload.message
                : `Failed to ingest ${file.name}.`;
          markUploadStatus(set, file.name, "failed", "Failed", errorMessage);
          throw new Error(errorMessage);
        }

        const chunksIngested =
          typeof statusPayload.chunks_ingested === "number" ? statusPayload.chunks_ingested : null;
        if (chunksIngested !== null && chunksIngested <= 0) {
          const errorMessage =
            typeof statusPayload.message === "string" && statusPayload.message.trim()
              ? statusPayload.message
              : `No searchable text was extracted from ${file.name}.`;
          markUploadStatus(set, file.name, "failed", "Failed", errorMessage);
          throw new Error(errorMessage);
        }

        successfulFiles.push(file);
        successfulFileNames.push(file.name);
        set((state) => ({
          uploadedFiles: successfulFiles,
          uploadedFileNames: successfulFileNames,
          uploadStatuses: state.uploadStatuses.map((entry) =>
            entry.fileName === file.name
              ? { ...entry, status: "indexed", detail: "Indexed", error: undefined }
              : entry,
          ),
        }));
      }
    } finally {
      set({ isBatchUploading: false });
    }
  },

  clearUploadedFiles: () => set({ uploadedFiles: [], uploadedFileNames: [], uploadStatuses: [] }),
}));
