import type { FormEvent, ReactNode } from "react";

export type Chat = {
  id: string;
  title: string;
  source: string;
  updatedAt: string;
  status: "ready" | "indexing" | "review";
  messages: number;
};

export type Message = {
  id: string;
  serverMessageId?: string;
  role: "assistant" | "user";
  content: string;
  feedback?: "like" | "dislike" | null;
  citations?: Citation[];
  retrievalMode?: "vector" | "hybrid" | "fallback" | "general" | "none";
  reasoningSteps?: ReasoningStep[];
  /** Assistant message is still receiving streamed tokens */
  isStreaming?: boolean;
};

export type Citation = {
  citationId: number | null;
  documentId: string;
  sourceFilename: string;
  pageNumber: number | null;
  pdfLinkWithPage: string;
  content: string;
  score: number | null;
};

export type ReasoningStep = {
  step: number;
  title: string;
  detail: string;
  status?: "pending" | "in_progress" | "completed";
};

export type ChatPanelProps = {
  activeChatId: string;
  messages: Message[];
  prompt: string;
  isReplyStreaming: boolean;
  isIndexingDocuments: boolean;
  isTtsEnabled: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStopStreaming: () => void;
  onTtsEnabledChange: (enabled: boolean) => void;
};

export type ChatComposerInputProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  isListening: boolean;
  idlePlaceholder: string;
  listeningPlaceholder: string;
};

export type ChatVoiceDictationRenderContext = {
  isListening: boolean;
  speechSupported: boolean;
  micControl: ReactNode;
};

export type ChatVoiceDictationProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  isReplyStreaming: boolean;
  onListeningChange?: (listening: boolean) => void;
  onBargeIn?: () => void;
  children: (context: ChatVoiceDictationRenderContext) => ReactNode;
};

export type ChatSidebarProps = {
  isSidebarCollapsed: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  activeChat: Chat;
  filteredChats: Chat[];
  hasMoreRecents: boolean;
  onLoadMoreRecents: () => void;
  onSelectChat: (chat: Chat) => void;
  onNewChat: () => void;
  onToggleSidebar: () => void;
};

export type RightPanelProps = {
  uploadedFiles: File[];
  uploadedFileNames: string[];
  uploadStatuses: UploadStatusItem[];
  isBatchUploading: boolean;
  onUploadedFilesChange: (files: File[]) => Promise<void>;
  onClearUploadedFiles: () => void;
};

export type UploadStatusItem = {
  fileName: string;
  status: "queued" | "ingesting" | "indexed" | "failed";
  detail?: string;
  error?: string;
};

export type WorkspaceHeaderProps = {
  activeChatTitle: string;
};

export type ChatWorkspaceLayoutProps = {
  isSidebarCollapsed: boolean;
  activeChatTitle: string;
  children: ReactNode;
};
