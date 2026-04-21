"use client";

import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import { useChatStore } from "@/stores/chat-store";

export function useChatWorkspace() {
  const dispose = useChatStore((s) => s.dispose);

  useEffect(() => {
    return () => {
      dispose();
    };
  }, [dispose]);

  return useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      prompt: s.prompt,
      setPrompt: s.setPrompt,
      uploadedFile: s.uploadedFile,
      uploadedFileName: s.uploadedFileName,
      setUploadedFile: s.setUploadedFile,
      isReplyStreaming: s.messages.some((m) => m.role === "assistant" && m.isStreaming),
      handleSubmit: s.submitPrompt,
      handleStopStreaming: s.stopStreaming,
      handleNewChat: s.newChat,
    })),
  );
}
