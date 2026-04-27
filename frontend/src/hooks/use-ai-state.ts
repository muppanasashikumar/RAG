"use client";

import { useShallow } from "zustand/react/shallow";

import { useChatStore } from "@/stores/chat-store";

export function useAIState() {
  return useChatStore(
    useShallow((s) => ({
      isReplyStreaming: s.messages.some((m) => m.role === "assistant" && m.isStreaming),
      handleSubmit: s.submitPrompt,
      handleStopStreaming: s.stopStreaming,
      handleNewChat: s.newChat,
    })),
  );
}
