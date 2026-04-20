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
  role: "assistant" | "user";
  content: string;
  citations?: string[];
  /** Assistant message is still receiving streamed tokens */
  isStreaming?: boolean;
};

export type ChatPanelProps = {
  messages: Message[];
  insights: string[];
  prompt: string;
  isReplyStreaming: boolean;
  onPromptChange: (value: string) => void;
  onInsightClick: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStopStreaming: () => void;
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
  children: (context: ChatVoiceDictationRenderContext) => ReactNode;
};

export type ChatSidebarProps = {
  isSidebarCollapsed: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  activeChat: Chat;
  filteredChats: Chat[];
  onSelectChat: (chat: Chat) => void;
  onNewChat: () => void;
  onToggleSidebar: () => void;
};

export type RightPanelProps = {
  uploadedFile: File | null;
  uploadedFileName: string;
  onUploadedFileChange: (file: File | null) => void;
};

export type WorkspaceHeaderProps = {
  activeChatTitle: string;
};

export type ChatWorkspaceLayoutProps = ChatSidebarProps & {
  children: ReactNode;
};
