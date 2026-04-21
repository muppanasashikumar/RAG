"use client";

import { ChatPanel, ChatWorkspaceLayout, RightPanel, insights } from "@/components/rag";
import { useAIState } from "@/hooks/use-ai-state";
import { useChatState } from "@/hooks/use-chat-state";
import { useSidebarState } from "@/hooks/use-sidebar-state";

export default function Home() {
  const {
    query,
    setQuery,
    activeChat,
    setActiveChat,
    isSidebarCollapsed,
    toggleSidebar,
    filteredChats,
  } = useSidebarState();

  const {
    messages,
    prompt,
    setPrompt,
    uploadedFile,
    uploadedFileName,
    setUploadedFile,
  } = useChatState();

  const {
    isReplyStreaming,
    handleSubmit,
    handleStopStreaming,
    handleNewChat,
  } = useAIState();

  return (
    <ChatWorkspaceLayout
      isSidebarCollapsed={isSidebarCollapsed}
      query={query}
      onQueryChange={setQuery}
      activeChat={activeChat}
      filteredChats={filteredChats}
      onSelectChat={setActiveChat}
      onNewChat={handleNewChat}
      onToggleSidebar={toggleSidebar}
    >
      <ChatPanel
        messages={messages}
        insights={insights}
        prompt={prompt}
        isReplyStreaming={isReplyStreaming}
        onPromptChange={setPrompt}
        onInsightClick={setPrompt}
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
