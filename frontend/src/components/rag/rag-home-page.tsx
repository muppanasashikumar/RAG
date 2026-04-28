"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";

import type { Chat } from "@/components/rag/chat/types";
import { ChatPanel, ChatSidebar, ChatWorkspaceLayout, RightPanel } from "@/components/rag";
import { useAIState } from "@/hooks/use-ai-state";
import { useChatState } from "@/hooks/use-chat-state";
import { useSidebarState } from "@/hooks/use-sidebar-state";
import { setAuthTokenProvider } from "@/lib/authenticated-fetch";
import { useChatVoiceStore } from "@/stores/chat";

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
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const syncedRouteChatIdRef = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const {
    query,
    setQuery,
    activeChat,
    setActiveChat,
    recentChats,
    isHydrated,
    hydrateRecentChats,
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
    uploadedFiles,
    uploadedFileNames,
    uploadStatuses,
    isBatchUploading,
    uploadBatchFiles,
    clearUploadedFiles,
    loadConversation,
  } = useChatState();

  const {
    isReplyStreaming,
    handleSubmit,
    handleStopStreaming,
    handleNewChat,
  } = useAIState();
  const { isTtsEnabled, setTtsEnabled } = useChatVoiceStore();

  useEffect(() => {
    setAuthTokenProvider(() => getToken());
    return () => {
      setAuthTokenProvider(null);
    };
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || isHydrated) {
      return;
    }
    hydrateRecentChats();
  }, [hydrateRecentChats, isHydrated, isLoaded, isSignedIn]);

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
      activeChatTitle={activeChat.title}
    >
      <ChatSidebar
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
      />
      <ChatPanel
        activeChatId={activeChat.id}
        messages={messages}
        prompt={prompt}
        isReplyStreaming={isReplyStreaming}
        isIndexingDocuments={isBatchUploading}
        isTtsEnabled={isTtsEnabled}
        onPromptChange={setPrompt}
        onSubmit={handleSubmit}
        onStopStreaming={handleStopStreaming}
        onTtsEnabledChange={setTtsEnabled}
      />
      <RightPanel
        uploadedFiles={uploadedFiles}
        uploadedFileNames={uploadedFileNames}
        uploadStatuses={uploadStatuses}
        isBatchUploading={isBatchUploading}
        onUploadedFilesChange={uploadBatchFiles}
        onClearUploadedFiles={clearUploadedFiles}
      />
    </ChatWorkspaceLayout>
  );
}
