import type { FormEvent } from "react";
import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

import type { Message } from "@/components/rag/chat/types";
import type {
  ChatMessagesState,
  ConversationPayload,
} from "@/stores/chat-store.typings";
import { authenticatedFetch } from "@/lib/authenticated-fetch";

import { useChatInputStore } from "@/stores/chat-input-store";
import {
  buildBackendUrl,
  DEFAULT_PROCESSING_STEPS,
  INDEXED_DOCUMENTS_LABEL,
  toConversationHistory,
  toRecentTimestampLabel,
} from "@/stores/chat-store.helpers";
import { useChatStreamingStore } from "@/stores/chat-streaming-store";
import { useChatUploadStore } from "@/stores/chat-upload-store";
import { useSidebarStore } from "@/stores/sidebar-store";

let loadConversationRequestId = 0;

export const useChatMessagesStore = create<ChatMessagesState>((set, get) => ({
  messages: [],

  newChat: () => {
    const { uploadedFileNames } = useChatUploadStore.getState();
    const sourceLabel = uploadedFileNames.length > 0 ? uploadedFileNames[0] : "No document uploaded";
    useSidebarStore.getState().setActiveChat({
      id: "new",
      title: "Untitled document chat",
      source: sourceLabel,
      updatedAt: "Now",
      status: "ready",
      messages: 0,
    });
    set({ messages: [] });
  },

  loadConversation: async (chatId) => {
    if (!chatId || chatId === "new") {
      set({ messages: [] });
      return;
    }
    const requestId = ++loadConversationRequestId;
    try {
      const response = await authenticatedFetch(
        buildBackendUrl(`/rag/chats/${encodeURIComponent(chatId)}/messages`),
      );
      if (!response.ok) {
        throw new Error("Failed to load conversation");
      }
      const payload = (await response.json()) as ConversationPayload;
      const history = toConversationHistory(payload);
      if (requestId !== loadConversationRequestId) {
        return;
      }
      set({ messages: useChatStreamingStore.getState().withActiveStreamMessages(chatId, history) });
    } catch {
      if (requestId !== loadConversationRequestId) {
        return;
      }
      const fallbackMessages: Message[] = [
        {
          id: uuidv4(),
          role: "assistant",
          content: "Unable to load this conversation right now.",
        },
      ];
      set({
        messages: [...useChatStreamingStore.getState().withActiveStreamMessages(chatId, fallbackMessages)],
      });
    }
  },

  submitPrompt: async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const prompt = useChatInputStore.getState().prompt;
    const { uploadedFileNames, uploadedFiles } = useChatUploadStore.getState();
    const { messages } = get();
    const isReplyStreaming = messages.some((m) => m.role === "assistant" && m.isStreaming);

    if (!prompt.trim() || isReplyStreaming) {
      return;
    }

    const userContent = prompt.trim();
    const userId = uuidv4();
    const assistantId = uuidv4();
    const fallbackCitation = uploadedFileNames[0] || INDEXED_DOCUMENTS_LABEL;
    const activeChat = useSidebarStore.getState().activeChat;

    const resolvedChatId = activeChat.id === "new" ? `chat-${userId}` : activeChat.id;
    const streamingState = useChatStreamingStore.getState();
    if (streamingState.hasActiveController(resolvedChatId)) {
      return;
    }
    useSidebarStore.getState().setActiveChat({
      id: resolvedChatId,
      title: userContent.length > 64 ? `${userContent.slice(0, 64).trimEnd()}...` : userContent,
      source: uploadedFileNames[0] || INDEXED_DOCUMENTS_LABEL,
      updatedAt: toRecentTimestampLabel(),
      status: "ready",
      messages: activeChat.messages,
    });

    useChatInputStore.getState().setPrompt("");
    const userMessage: Message = { id: userId, role: "user", content: userContent };
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
      reasoningSteps: DEFAULT_PROCESSING_STEPS.map((step, index) => ({
        ...step,
        status: index === 0 ? "in_progress" : "pending",
      })),
    };
    streamingState.beginSession(resolvedChatId, {
      userMessage,
      assistantMessage,
    });
    set((s) => ({
      messages: [...s.messages, userMessage, assistantMessage],
    }) as Partial<ChatMessagesState>);

    await streamingState.streamAssistantReply({
      set,
      get,
      resolvedChatId,
      userContent,
      assistantId,
      fallbackCitation,
      uploadedFileNames,
      uploadedFiles,
    });
  },
}));
