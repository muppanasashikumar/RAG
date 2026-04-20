import { PanelLeftClose, PanelLeftOpen, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

type ChatSidebarHeaderProps = {
  collapsed: boolean;
  onNewChat: () => void;
  onToggleSidebar: () => void;
};

export function ChatSidebarHeader({
  collapsed,
  onNewChat,
  onToggleSidebar,
}: ChatSidebarHeaderProps) {
  return (
    <div className="shrink-0 border-b px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          {!collapsed ? (
            <div>
              <p className="font-heading text-lg font-semibold">Astra RAG</p>
              <p className="text-sm text-muted-foreground">Agentic document AI</p>
            </div>
          ) : null}
        </div>
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleSidebar}
            className="inline-flex"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      <Button className="mt-5 w-full" onClick={onNewChat} title="New chat">
        <Plus className="size-4" aria-hidden="true" />
        {!collapsed ? "New chat" : null}
      </Button>
    </div>
  );
}
