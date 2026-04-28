import { create } from "zustand";

import type { ChatUploadState } from "@/stores/chat-store.typings";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  buildBackendUrl,
  markUploadStatus,
} from "@/stores/chat-store.helpers";

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
    }));
    set({ isBatchUploading: true, uploadStatuses: initialStatuses });
    try {
      const successfulFiles: File[] = [];
      const successfulFileNames: string[] = [];
      for (const file of files) {
        markUploadStatus(set, file.name, "ingesting");
        const formData = new FormData();
        formData.append("file", file, file.name);
        const response = await authenticatedFetch(buildBackendUrl("/ingest"), {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const errorMessage = detail || `Failed to ingest ${file.name} (${response.status})`;
          markUploadStatus(set, file.name, "failed", errorMessage);
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
          markUploadStatus(set, file.name, "failed", errorMessage);
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
}));
