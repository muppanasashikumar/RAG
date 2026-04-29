import { create } from "zustand";

import type {
  Citation,
  Message,
} from "@/components/rag/chat/types";
import type {
  ActiveStreamSession,
  StoreSetter,
  StreamEventPayload,
} from "@/stores/chat-store.typings";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { StreamManager } from "@/stores/chat-stream-manager";

import {
  appendStoppedSuffix,
  buildBackendUrl,
  buildReasoningSteps,
  dedupeCitations,
  DEFAULT_PROCESSING_STEPS,
  INDEXED_DOCUMENTS_LABEL,
  normalizeRetrievalMode,
  toNormalizedCitations,
  toRecentTimestampLabel,
  updateAssistantInStore,
  withReasoningProgress,
} from "@/stores/chat-store.helpers";
import { useSidebarStore } from "@/stores/sidebar-store";

type StreamReplyArgs<TState extends { messages: Message[] }> = {
  set: StoreSetter<TState>;
  get: () => TState;
  resolvedChatId: string;
  userContent: string;
  assistantId: string;
  fallbackCitation: string;
  uploadedFileNames: string[];
  uploadedFiles: File[];
};

type ChatStreamingState = {
  hasActiveController: (chatId: string) => boolean;
  beginSession: (chatId: string, session: ActiveStreamSession) => AbortController;
  withActiveStreamMessages: (chatId: string, history: Message[]) => Message[];
  stopStreamingForChat: <TState extends { messages: Message[] }>(
    chatId: string,
    set: StoreSetter<TState>,
  ) => void;
  streamAssistantReply: <TState extends { messages: Message[] }>(args: StreamReplyArgs<TState>) => Promise<void>;
  disposeAllStreams: () => void;
};

const streamManager = new StreamManager();
const STREAM_READ_TIMEOUT_MS = 20_000;
const STREAM_ERROR_DEFAULT_MESSAGE = "Something went wrong while streaming the reply.";

function updateAssistantInSession(chatId: string, updater: (message: Message) => Message) {
  const streamSession = streamManager.getSession(chatId);
  if (!streamSession) {
    return;
  }
  streamManager.updateSession(chatId, (current) => ({
    ...current,
    assistantMessage: updater(current.assistantMessage),
  }));
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return await new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Connection lost while waiting for response from server."));
    }, STREAM_READ_TIMEOUT_MS);
    reader
      .read()
      .then((result) => {
        window.clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export const useChatStreamingStore = create<ChatStreamingState>(() => ({
  hasActiveController: (chatId) => streamManager.hasActiveStream(chatId),

  beginSession: (chatId, session) => {
    return streamManager.start(chatId, session);
  },

  withActiveStreamMessages: (chatId, history) => {
    const session = streamManager.getSession(chatId);
    if (!session) {
      return history;
    }
    const seenIds = new Set(history.map((item) => item.id));
    const merged = [...history];
    if (!seenIds.has(session.userMessage.id)) {
      merged.push(session.userMessage);
    }
    if (!seenIds.has(session.assistantMessage.id)) {
      merged.push(session.assistantMessage);
    }
    return merged;
  },

  stopStreamingForChat: (chatId, set) => {
    if (!chatId || chatId === "new") {
      return;
    }
    streamManager.markStopRequested(chatId);
    streamManager.cancel(chatId);

    const activeStreamSession = streamManager.getSession(chatId);
    if (activeStreamSession) {
      updateAssistantInSession(chatId, (assistantMessage) => ({
        ...assistantMessage,
        content: appendStoppedSuffix(assistantMessage.content),
        isStreaming: false,
      }));
    }

    updateAssistantInStore(
      set,
      (message) => message.role === "assistant" && !!message.isStreaming,
      (message) => ({
        ...message,
        isStreaming: false,
        content: appendStoppedSuffix(message.content),
      }),
    );
  },

  streamAssistantReply: async <TState extends { messages: Message[] }>({
    set,
    get,
    resolvedChatId,
    userContent,
    assistantId,
    fallbackCitation,
    uploadedFileNames,
    uploadedFiles,
  }: StreamReplyArgs<TState>) => {
    const controller = streamManager.getController(resolvedChatId);
    if (!controller) {
      return;
    }

    let activeStep = 0;
    const progressTimer = setInterval(() => {
      activeStep = Math.min(activeStep + 1, DEFAULT_PROCESSING_STEPS.length - 1);
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id !== assistantId
            ? message
            : { ...message, reasoningSteps: withReasoningProgress(activeStep) },
        ),
      }) as Partial<TState>);
    }, 900);

    try {
      const selectedFile = uploadedFiles[0];
      const formData = new FormData();
      formData.append("query", userContent);
      formData.append("chat_id", resolvedChatId);
      formData.append("response_language", "auto");
      if (selectedFile) {
        formData.append("file", selectedFile, selectedFile.name);
      }
      const response = await authenticatedFetch(buildBackendUrl("/chat/stream"), {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `Request failed (${response.status})`);
      }
      if (!response.body) {
        throw new Error("No response stream from backend.");
      }

      const reader = response.body.getReader();
      streamManager.setReader(resolvedChatId, reader);
      const decoder = new TextDecoder();
      let streamBuffer = "";
      let accumulated = "";
      let streamedCitations: Citation[] = [];
      let streamedRetrievalMode: Message["retrievalMode"] | undefined;
      let backendErrorMessage: string | null = null;

      let done = false;
      while (!done) {
        const { value, done: streamDone } = await readWithTimeout(reader);
        if (streamDone) {
          break;
        }
        streamBuffer += decoder.decode(value, { stream: true });
        const events = streamBuffer.split("\n\n");
        streamBuffer = events.pop() ?? "";

        for (const eventChunk of events) {
          const dataLines = eventChunk
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6));
          if (dataLines.length === 0) {
            continue;
          }
          const eventData = dataLines.join("\n").trim();
          if (eventData === "[DONE]") {
            done = true;
            break;
          }

          let parsed: StreamEventPayload | null = null;
          try {
            parsed = JSON.parse(eventData) as StreamEventPayload;
          } catch {
            continue;
          }

          if (parsed?.type === "token" && typeof parsed.content === "string") {
            accumulated += parsed.content;
            updateAssistantInSession(resolvedChatId, (assistant) => ({
              ...assistant,
              content: accumulated,
            }));
            updateAssistantInStore(
              set,
              (message) => message.id === assistantId,
              (message) => ({ ...message, content: accumulated }),
            );
          }
          if (parsed?.type === "error") {
            backendErrorMessage =
              typeof parsed.content === "string" && parsed.content.trim()
                ? parsed.content
                : typeof (parsed as { message?: unknown }).message === "string" &&
                    (parsed as { message?: string }).message?.trim()
                  ? (parsed as { message?: string }).message ?? null
                  : STREAM_ERROR_DEFAULT_MESSAGE;
            done = true;
            break;
          }
          if (parsed?.type === "citations") {
            streamedCitations = toNormalizedCitations(parsed.citations, fallbackCitation);
            streamedRetrievalMode = normalizeRetrievalMode(parsed.retrieval_mode);
          }
          if (parsed?.type === "persisted" && typeof parsed.assistant_message_id === "string") {
            updateAssistantInSession(resolvedChatId, (assistant) => ({
              ...assistant,
              serverMessageId: parsed.assistant_message_id,
            }));
            updateAssistantInStore(
              set,
              (message) => message.id === assistantId,
              (message) => ({
                ...message,
                serverMessageId: parsed.assistant_message_id,
              }),
            );
            const llmTitle = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : null;
            if (llmTitle) {
              const nextMessageCount = get().messages.length;
              useSidebarStore.getState().upsertRecentChat({
                id: resolvedChatId,
                title: llmTitle,
                source: uploadedFileNames[0] || INDEXED_DOCUMENTS_LABEL,
                updatedAt: toRecentTimestampLabel(),
                status: "ready",
                messages: nextMessageCount,
              });
            }
          }
        }
      }

      const dedupedCitations = dedupeCitations(streamedCitations);
      const finalContent =
        backendErrorMessage ||
        accumulated ||
        "Connection lost before receiving a response.";
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: finalContent,
                isStreaming: false,
                citations: dedupedCitations,
                retrievalMode: streamedRetrievalMode,
                reasoningSteps: buildReasoningSteps("completed"),
              }
            : message,
        ),
      }) as Partial<TState>);
      updateAssistantInSession(resolvedChatId, (assistant) => ({
        ...assistant,
        content: finalContent,
        isStreaming: false,
        citations: dedupedCitations,
        retrievalMode: streamedRetrievalMode,
        reasoningSteps: buildReasoningSteps("completed"),
      }));

      const nextMessageCount = get().messages.length;
      const activeTitle = useSidebarStore.getState().activeChat.title;
      useSidebarStore.getState().upsertRecentChat({
        id: resolvedChatId,
        title: activeTitle || (userContent.length > 64 ? `${userContent.slice(0, 64).trimEnd()}...` : userContent),
        source: uploadedFileNames[0] || INDEXED_DOCUMENTS_LABEL,
        updatedAt: toRecentTimestampLabel(),
        status: "ready",
        messages: nextMessageCount,
      });
    } catch (error) {
      if ((error instanceof DOMException && error.name === "AbortError") || controller.signal.aborted) {
        const wasUserStopRequested = streamManager.wasStopRequested(resolvedChatId);
        streamManager.setReader(resolvedChatId, undefined);
        if (!wasUserStopRequested) {
          updateAssistantInSession(resolvedChatId, (assistant) => ({
            ...assistant,
            content: appendStoppedSuffix(assistant.content),
            isStreaming: false,
          }));
          updateAssistantInStore(
            set,
            (message) => message.id === assistantId,
            (message) => ({
              ...message,
              content: appendStoppedSuffix(message.content),
              isStreaming: false,
            }),
          );
        }
        return;
      }

      const fallback =
        error instanceof Error ? error.message : "Something went wrong while streaming the reply.";
      updateAssistantInSession(resolvedChatId, (assistant) => ({
        ...assistant,
        content: assistant.content || fallback,
        isStreaming: false,
      }));
      updateAssistantInStore(
        set,
        (message) => message.id === assistantId,
        (message) => ({
          ...message,
          content: message.content || fallback,
          isStreaming: false,
          citations: message.citations,
        }),
      );
    } finally {
      clearInterval(progressTimer);
      streamManager.setReader(resolvedChatId, undefined);
      streamManager.end(resolvedChatId, controller);
    }
  },

  disposeAllStreams: () => {
    streamManager.cancelAll();
  },
}));
