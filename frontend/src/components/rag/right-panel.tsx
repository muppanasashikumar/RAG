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

export function RightPanel({ uploadedFile, uploadedFileName, onUploadedFileChange }: RightPanelProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);

  const hasFile = uploadedFile !== null || uploadedFileName.trim().length > 0;

  function clearUploadedFile() {
    setUploadError(null);
    onUploadedFileChange(null);
  }

  const applyFile = useCallback(
    (file: File | undefined, resetInput?: HTMLInputElement | null) => {
      if (!file) {
        return;
      }
      const message = validateSelectedFile(file);
      if (message) {
        setUploadError(message);
        if (resetInput) {
          resetInput.value = "";
        }
        return;
      }
      setUploadError(null);
      onUploadedFileChange(file);
    },
    [onUploadedFileChange],
  );

  const handleDropAccepted = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) {
        setUploadError("Drop a single file to upload.");
        return;
      }
      applyFile(file);
    },
    [applyFile],
  );

  const handleDropRejected = useCallback((rejections: FileRejection[]) => {
    if (rejections.length === 0) {
      setUploadError("Drop a single file to upload.");
      return;
    }
    if (rejections.length > 1) {
      setUploadError("Drop one file at a time.");
      return;
    }
    const [{ errors }] = rejections;
    if (errors.some((error) => error.code === "too-many-files")) {
      setUploadError("Drop one file at a time.");
      return;
    }
    setUploadError("Use a supported type: PDF, DOC, DOCX, TXT, or CSV.");
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    multiple: false,
    maxFiles: 1,
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
            {isDragActive ? "Release to upload" : "Drop a file or browse"}
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
            className="mt-3 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            Browse files
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
                className={`truncate text-sm font-medium ${!hasFile ? "text-muted-foreground" : ""}`}
              >
                {hasFile ? uploadedFileName : "No document selected"}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasFile ? "Indexed for this chat" : "Upload a file to ground answers"}
              </p>
            </div>
            {hasFile ? (
              <button
                type="button"
                onClick={clearUploadedFile}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Remove document"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

    </aside>
  );
}
