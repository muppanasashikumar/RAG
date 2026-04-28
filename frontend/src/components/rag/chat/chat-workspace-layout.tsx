"use client";

import { Children } from "react";
import type { ChatWorkspaceLayoutProps } from "@/components/rag/chat/types";
import { WorkspaceHeader } from "./workspace-header";

export function ChatWorkspaceLayout({
  isSidebarCollapsed,
  activeChatTitle,
  children,
}: ChatWorkspaceLayoutProps) {
  const [sidebar, ...workspacePanels] = Children.toArray(children);

  return (
    <main className="h-dvh overflow-hidden bg-background text-foreground">
      <div
        className={`grid h-full min-h-0 ${
          isSidebarCollapsed ? "grid-cols-[96px_1fr]" : "grid-cols-[320px_1fr]"
        }`}
      >
        {sidebar}

        <section className="flex h-full min-h-0 flex-col overflow-hidden">
          <WorkspaceHeader activeChatTitle={activeChatTitle} />

          <div className="grid min-h-0 flex-1 gap-5 overflow-hidden p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            {workspacePanels}
          </div>
        </section>
      </div>
    </main>
  );
}
