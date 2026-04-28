"use client";

import { useShallow } from "zustand/react/shallow";

import { useChatInputStore } from "@/stores/chat";
import { useChatMessagesStore } from "@/stores/chat";
import { useChatUploadStore } from "@/stores/chat";

export function useChatState() {
  const messageState = useChatMessagesStore(
    useShallow((s) => ({
      messages: s.messages,
      loadConversation: s.loadConversation,
    })),
  );
  const inputState = useChatInputStore(
    useShallow((s) => ({
      prompt: s.prompt,
      setPrompt: s.setPrompt,
    })),
  );
  const uploadState = useChatUploadStore(
    useShallow((s) => ({
      uploadedFiles: s.uploadedFiles,
      uploadedFileNames: s.uploadedFileNames,
      uploadStatuses: s.uploadStatuses,
      isBatchUploading: s.isBatchUploading,
      uploadBatchFiles: s.uploadBatchFiles,
      clearUploadedFiles: s.clearUploadedFiles,
    })),
  );

  return {
    ...messageState,
    ...inputState,
    ...uploadState,
  };
}
