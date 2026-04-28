"use client";

import { useShallow } from "zustand/react/shallow";

import { useChatMessagesStore } from "@/stores/chat";
import { useChatStreamingStore } from "@/stores/chat";
import { useSidebarStore } from "@/stores/sidebar-store";

export function useAIState() {
  const messageState = useChatMessagesStore(
    useShallow((s) => ({
      isReplyStreaming: s.messages.some((m) => m.role === "assistant" && m.isStreaming),
      handleSubmit: s.submitPrompt,
      handleNewChat: s.newChat,
    })),
  );

  return {
    ...messageState,
    handleStopStreaming: () => {
      const activeChatId = useSidebarStore.getState().activeChat.id;
      useChatStreamingStore.getState().stopStreamingForChat(activeChatId, useChatMessagesStore.setState);
    },
  };
}
