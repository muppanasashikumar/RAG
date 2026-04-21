"use client";

import { ChatSidebar } from "@/components/rag/sidebar/chat-sidebar";
import type { ChatWorkspaceLayoutProps } from "@/components/rag/chat/types";
import { WorkspaceHeader } from "./workspace-header";

export function ChatWorkspaceLayout({
  isSidebarCollapsed,
  query,
  onQueryChange,
  activeChat,
  filteredChats,
  onSelectChat,
  onNewChat,
  onToggleSidebar,
  children,
}: ChatWorkspaceLayoutProps) {
  return (
    <main className="h-dvh overflow-hidden bg-background text-foreground">
      <div
        className={`grid h-full min-h-0 ${
          isSidebarCollapsed ? "grid-cols-[96px_1fr]" : "grid-cols-[320px_1fr]"
        }`}
      >
        <ChatSidebar
          isSidebarCollapsed={isSidebarCollapsed}
          query={query}
          onQueryChange={onQueryChange}
          activeChat={activeChat}
          filteredChats={filteredChats}
          onSelectChat={onSelectChat}
          onNewChat={onNewChat}
          onToggleSidebar={onToggleSidebar}
        />

        <section className="flex h-full min-h-0 flex-col overflow-hidden">
          <WorkspaceHeader activeChatTitle={activeChat.title} />

          <div className="grid min-h-0 flex-1 gap-5 overflow-hidden p-5 xl:grid-cols-[minmax(0,1fr)_360px]">{children}</div>
        </section>
      </div>
    </main>
  );
}
