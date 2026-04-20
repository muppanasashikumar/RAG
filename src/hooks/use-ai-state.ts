"use client";

import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import { useChatStore } from "@/stores/chat-store";

export function useAIState() {
  const dispose = useChatStore((s) => s.dispose);

  useEffect(() => {
    return () => {
      dispose();
    };
  }, [dispose]);

  return useChatStore(
    useShallow((s) => ({
      isReplyStreaming: s.messages.some((m) => m.role === "assistant" && m.isStreaming),
      handleSubmit: s.submitPrompt,
      handleStopStreaming: s.stopStreaming,
      handleNewChat: s.newChat,
    })),
  );
}
