"use client";

import { useShallow } from "zustand/react/shallow";

import { useChatInputStore } from "@/stores/chat";
import { useChatMessagesStore } from "@/stores/chat";
import { useChatStreamingStore } from "@/stores/chat";
import { useChatUploadStore } from "@/stores/chat";
import { useSidebarStore } from "@/stores/sidebar-store";

export function useChatWorkspace() {
  const messageState = useChatMessagesStore(
    useShallow((s) => ({
      messages: s.messages,
      loadConversation: s.loadConversation,
      handleSubmit: s.submitPrompt,
      handleNewChat: s.newChat,
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
    handleStopStreaming: () => {
      const activeChatId = useSidebarStore.getState().activeChat.id;
      useChatStreamingStore.getState().stopStreamingForChat(activeChatId, useChatMessagesStore.setState);
    },
    isReplyStreaming: messageState.messages.some((m) => m.role === "assistant" && m.isStreaming),
  };
}
