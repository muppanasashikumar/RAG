"use client";

import { useShallow } from "zustand/react/shallow";

import { useChatStore } from "@/stores/chat-store";

export function useChatState() {
  return useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      prompt: s.prompt,
      setPrompt: s.setPrompt,
      uploadedFiles: s.uploadedFiles,
      uploadedFileNames: s.uploadedFileNames,
      isBatchUploading: s.isBatchUploading,
      uploadBatchFiles: s.uploadBatchFiles,
      clearUploadedFiles: s.clearUploadedFiles,
      loadConversation: s.loadConversation,
    })),
  );
}
