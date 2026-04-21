"use client";

import { useShallow } from "zustand/react/shallow";

import { useChatStore } from "@/stores/chat-store";

export function useChatState() {
  return useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      prompt: s.prompt,
      setPrompt: s.setPrompt,
      uploadedFile: s.uploadedFile,
      uploadedFileName: s.uploadedFileName,
      setUploadedFile: s.setUploadedFile,
      loadConversation: s.loadConversation,
    })),
  );
}
