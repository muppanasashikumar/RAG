"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { Chat } from "@/components/rag/chat/types";
import { ChatPanel, ChatWorkspaceLayout, RightPanel } from "@/components/rag";
import { useAIState } from "@/hooks/use-ai-state";
import { useChatState } from "@/hooks/use-chat-state";
import { useSidebarState } from "@/hooks/use-sidebar-state";

type RagHomePageProps = {
  routeChatId?: string;
};

function createPlaceholderChat(chatId: string): Chat {
  return {
    id: chatId,
    title: "Loading chat...",
    source: "Stored conversation",
    updatedAt: new Date().toISOString(),
    status: "ready",
    messages: 0,
  };
}

export function RagHomePage({ routeChatId }: RagHomePageProps) {
  const syncedRouteChatIdRef = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const {
    query,
    setQuery,
    activeChat,
    setActiveChat,
    recentChats,
    isSidebarCollapsed,
    toggleSidebar,
    filteredChats,
    hasMoreRecents,
    fetchMoreRecentChats,
  } = useSidebarState();

  const {
    messages,
    prompt,
    setPrompt,
    uploadedFile,
    uploadedFileName,
    setUploadedFile,
    loadConversation,
  } = useChatState();

  const {
    isReplyStreaming,
    handleSubmit,
    handleStopStreaming,
    handleNewChat,
  } = useAIState();

  useEffect(() => {
    if (!routeChatId) {
      syncedRouteChatIdRef.current = null;
      return;
    }
    const matched = recentChats.find((chat) => chat.id === routeChatId);
    if (syncedRouteChatIdRef.current === routeChatId) {
      if (matched) {
        setActiveChat(matched);
      }
      return;
    }
    syncedRouteChatIdRef.current = routeChatId;
    setActiveChat(matched ?? createPlaceholderChat(routeChatId));
    void loadConversation(routeChatId);
  }, [loadConversation, recentChats, routeChatId, setActiveChat]);

  const handleSelectChat = (chat: Chat) => {
    const targetPath = `/chat/${encodeURIComponent(chat.id)}`;
    if (pathname !== targetPath) {
      router.replace(targetPath);
    }
    setActiveChat(chat);
    void loadConversation(chat.id);
  };

  const onNewChat = () => {
    handleNewChat();
    router.replace("/");
  };

  return (
    <ChatWorkspaceLayout
      isSidebarCollapsed={isSidebarCollapsed}
      query={query}
      onQueryChange={setQuery}
      activeChat={activeChat}
      filteredChats={filteredChats}
      hasMoreRecents={hasMoreRecents}
      onLoadMoreRecents={fetchMoreRecentChats}
      onSelectChat={handleSelectChat}
      onNewChat={onNewChat}
      onToggleSidebar={toggleSidebar}
    >
      <ChatPanel
        messages={messages}
        prompt={prompt}
        isReplyStreaming={isReplyStreaming}
        onPromptChange={setPrompt}
        onSubmit={handleSubmit}
        onStopStreaming={handleStopStreaming}
      />
      <RightPanel
        uploadedFile={uploadedFile}
        uploadedFileName={uploadedFileName}
        onUploadedFileChange={setUploadedFile}
      />
    </ChatWorkspaceLayout>
  );
}
