import { MessageSquareText } from "lucide-react";

import { statusLabel } from "@/components/rag/chat/mock-data";
import type { Chat } from "@/components/rag/chat/types";

type ChatHistoryItemProps = {
  chat: Chat;
  isActive: boolean;
  compact?: boolean;
  onSelect: (chat: Chat) => void;
};

export function ChatHistoryItem({ chat, isActive, compact = false, onSelect }: ChatHistoryItemProps) {
  return (
    <button
      key={chat.id}
      type="button"
      onClick={() => onSelect(chat)}
      className={`w-full rounded-lg border text-left transition hover:border-ring hover:bg-muted/60 ${
        isActive ? "border-ring bg-muted" : "border-transparent bg-transparent"
      } ${compact ? "px-3 py-2.5" : "p-3"}`}
      title={chat.title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{chat.title}</p>
          <p className={`${compact ? "mt-0.5" : "mt-1"} truncate text-xs text-muted-foreground`}>
            {chat.source}
          </p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{chat.updatedAt}</span>
      </div>
      <div className={`${compact ? "mt-2" : "mt-3"} flex items-center justify-between text-xs text-muted-foreground`}>
        <span className="flex items-center gap-1.5">
          <MessageSquareText className="size-3.5" aria-hidden="true" />
          {chat.messages} messages
        </span>
        <span>{statusLabel[chat.status]}</span>
      </div>
    </button>
  );
}
