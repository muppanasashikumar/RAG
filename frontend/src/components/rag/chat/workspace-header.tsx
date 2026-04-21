"use client";

import type { WorkspaceHeaderProps } from "@/components/rag/chat/types";
import { FolderOpen } from "lucide-react";

export function WorkspaceHeader({ activeChatTitle }: WorkspaceHeaderProps) {
  return (
    <header className="shrink-0 border-b bg-background px-5 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="size-4" aria-hidden="true" />
            Workspace
          </div>
          <h1 className="font-heading mt-1 text-2xl font-semibold">{activeChatTitle}</h1>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Retrieval mode</p>
            <p className="mt-1 text-sm font-medium">Hybrid search</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Documents</p>
            <p className="mt-1 text-sm font-medium">12 indexed</p>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Guardrails</p>
            <p className="mt-1 text-sm font-medium">Citations required</p>
          </div>
        </div>
      </div>
    </header>
  );
}
