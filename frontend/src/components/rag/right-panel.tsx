"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import type { RightPanelProps } from "@/components/rag/chat/types";
import { FileText, UploadCloud, X } from "lucide-react";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".txt", ".csv"]);

function formatMaxSize(): string {
  return "50 MB";
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

function validateSelectedFile(file: File): string | null {
  const ext = getExtension(file.name);
  if (!ext || !ACCEPTED_EXTENSIONS.has(ext)) {
    return `Use a supported type: PDF, DOC, DOCX, TXT, or CSV.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `File is too large. Maximum size is ${formatMaxSize()} (this file is ${(file.size / (1024 * 1024)).toFixed(1)} MB).`;
  }
  return null;
}

function validateSelectedFiles(files: File[]): string | null {
  if (files.length === 0) {
    return "Select at least one file.";
  }
  for (const file of files) {
    const error = validateSelectedFile(file);
    if (error) {
      return error;
    }
  }
  return null;
}

export function RightPanel({
  uploadedFiles,
  uploadedFileNames,
  uploadStatuses,
  isBatchUploading,
  onUploadedFilesChange,
  onClearUploadedFiles,
}: RightPanelProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const hasFiles = uploadedFiles.length > 0 || uploadedFileNames.length > 0;
  const selectedSummary = uploadedFileNames.length > 0 ? uploadedFileNames.join(", ") : "No documents selected";

  function clearUploadedFiles() {
    setUploadError(null);
    onClearUploadedFiles();
  }

  const applyFiles = useCallback(
    async (files: File[], resetInput?: HTMLInputElement | null) => {
      const message = validateSelectedFiles(files);
      if (message) {
        setUploadError(message);
        if (resetInput) {
          resetInput.value = "";
        }
        return;
      }
      setUploadError(null);
      try {
        await onUploadedFilesChange(files);
      } catch (error) {
        const fallback =
          error instanceof Error
            ? error.message
            : "Upload failed. Ensure backend ingestion service is reachable.";
        setUploadError(fallback);
      }
    },
    [onUploadedFilesChange],
  );

  const handleDropAccepted = useCallback(
    (acceptedFiles: File[]) => {
      void applyFiles(acceptedFiles).catch((error) => {
        const fallback =
          error instanceof Error
            ? error.message
            : "Upload failed. Ensure backend ingestion service is reachable.";
        setUploadError(fallback);
      });
    },
    [applyFiles],
  );

  const handleDropRejected = useCallback((rejections: FileRejection[]) => {
    if (rejections.length === 0) {
      setUploadError("Drop files to upload.");
      return;
    }
    if (rejections.some((rejection) => rejection.errors.some((error) => error.code === "too-many-files"))) {
      setUploadError("Too many files selected.");
      return;
    }
    setUploadError("Use a supported type: PDF, DOC, DOCX, TXT, or CSV.");
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    multiple: true,
    noKeyboard: true,
    onDropAccepted: handleDropAccepted,
    onDropRejected: handleDropRejected,
    accept: {
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
      "text/csv": [".csv"],
    },
  });

  const uploadFieldId = "rag-document-upload";
  const errorId = "rag-document-upload-error";

  return (
    <aside className="space-y-5">
      <div className="rounded-lg border bg-background p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-heading font-semibold">Upload document</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add files for retrieval, summaries, and agent workflows.
            </p>
          </div>
          <Image
            src="/file.svg"
            alt="Document icon"
            width={36}
            height={36}
            className="opacity-70"
          />
        </div>

        <div
          {...getRootProps()}
          className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center transition hover:border-ring hover:bg-muted ${
            isDragActive ? "border-primary bg-primary/5 ring-2 ring-ring/40" : "bg-muted/40"
          } ${uploadError ? "border-destructive/60" : ""}`}
          aria-describedby={uploadError ? errorId : undefined}
        >
          <input {...getInputProps({ id: uploadFieldId })} />
          <UploadCloud className="size-9 text-muted-foreground" aria-hidden="true" />
          <span className="mt-3 text-sm font-medium">
            {isDragActive ? "Release to upload" : "Drop files or browse"}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            PDF, DOC, DOCX, TXT, CSV up to {formatMaxSize()}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              open();
            }}
            disabled={isBatchUploading}
            className="mt-3 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            {isBatchUploading ? "Uploading..." : "Browse files"}
          </button>
        </div>

        {uploadError ? (
          <p id={errorId} role="alert" className="mt-2 text-sm text-destructive">
            {uploadError}
          </p>
        ) : null}

        <div className="mt-4 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <FileText className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-sm font-medium ${!hasFiles ? "text-muted-foreground" : ""}`}
              >
                {selectedSummary}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasFiles ? `${uploadedFileNames.length} document(s) ready for retrieval` : "Upload files to ground answers"}
              </p>
            </div>
            {hasFiles ? (
              <button
                type="button"
                onClick={clearUploadedFiles}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Remove documents"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        {uploadStatuses.length > 0 ? (
          <div className="mt-3 rounded-lg border bg-card p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ingestion progress
            </p>
            <div className="mt-2 space-y-2">
              {uploadStatuses.map((entry) => {
                const statusLabel =
                  entry.status === "queued"
                    ? "Queued"
                    : entry.status === "ingesting"
                      ? "Ingesting"
                      : entry.status === "indexed"
                        ? "Indexed"
                        : "Failed";
                const statusClass =
                  entry.status === "indexed"
                    ? "text-emerald-600"
                    : entry.status === "failed"
                      ? "text-destructive"
                      : "text-muted-foreground";
                return (
                  <div key={`${entry.fileName}-${entry.status}`} className="rounded-md border bg-background p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium">{entry.fileName}</p>
                      <span className={`text-xs font-medium ${statusClass}`}>{statusLabel}</span>
                    </div>
                    {entry.error ? (
                      <p className="mt-1 text-xs text-destructive">{entry.error}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

    </aside>
  );
}
