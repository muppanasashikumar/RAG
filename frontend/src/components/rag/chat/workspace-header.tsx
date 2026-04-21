"use client";

import type { WorkspaceHeaderProps } from "@/components/rag/chat/types";
import { FolderOpen } from "lucide-react";

export function WorkspaceHeader({ activeChatTitle }: WorkspaceHeaderProps) {
  return (
    <header className="shrink-0 border-b bg-background px-5 py-4">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="size-4" aria-hidden="true" />
          Workspace
        </div>
        <h1 className="font-heading mt-1 text-2xl font-semibold">{activeChatTitle}</h1>
      </div>
    </header>
  );
}
