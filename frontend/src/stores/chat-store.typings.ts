import type { FormEvent } from "react";

import type {
  Message,
  UploadStatusItem,
} from "@/components/rag/chat/types";

export type BackendCitation = {
  citation_id?: unknown;
  document_id?: unknown;
  source_filename?: unknown;
  page_number?: unknown;
  pdf_link_with_page?: unknown;
  content?: unknown;
  score?: unknown;
};

export type BackendMessage = {
  message_id?: unknown;
  role?: unknown;
  content?: unknown;
  feedback?: unknown;
  citations?: BackendCitation[] | unknown;
};

export type ConversationPayload = {
  messages?: BackendMessage[];
};

export type StreamEventPayload = {
  type?: unknown;
  content?: unknown;
  citations?: unknown;
  retrieval_mode?: unknown;
  assistant_message_id?: string;
  chat_id?: string;
  title?: unknown;
};

export type StoreSetter<TState> = (
  partial: Partial<TState> | ((state: TState) => Partial<TState>)
) => void;

export type ActiveStreamSession = {
  userMessage: Message;
  assistantMessage: Message;
};

export type ChatUploadState = {
  uploadedFiles: File[];
  uploadedFileNames: string[];
  uploadStatuses: UploadStatusItem[];
  isBatchUploading: boolean;
  uploadBatchFiles: (files: File[]) => Promise<void>;
  clearUploadedFiles: () => void;
};

export type ChatInputState = {
  prompt: string;
  setPrompt: (prompt: string) => void;
};

export type ChatVoiceState = {
  isTtsEnabled: boolean;
  setTtsEnabled: (enabled: boolean) => void;
};

export type ChatMessagesState = {
  messages: Message[];
  newChat: () => void;
  loadConversation: (chatId: string) => Promise<void>;
  submitPrompt: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export type ChatState = ChatUploadState & ChatInputState & ChatVoiceState & ChatMessagesState;
