import { History } from "lucide-react";
import type { RefObject } from "react";

import { ChatHistoryList } from "@/components/rag/sidebar/chat-history-list";

import type { Chat } from "@/components/rag/chat/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChatSearchInput } from "./chat-search-input";

type ChatRecentsPopoverProps = {
  open: boolean;
  query: string;
  chats: Chat[];
  activeChatId: string;
  hasMoreRecents: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (nextQuery: string) => void;
  onLoadMore: () => void;
  onSelectChat: (chat: Chat) => void;
};

export function ChatRecentsPopover({
  open,
  query,
  chats,
  activeChatId,
  hasMoreRecents,
  searchInputRef,
  onOpenChange,
  onQueryChange,
  onLoadMore,
  onSelectChat,
}: ChatRecentsPopoverProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant={open ? "secondary" : "outline"}
            size="icon"
            aria-label="Recent chats"
            title="Recent chats"
          />
        }
        className="size-10 w-full shrink-0 rounded-lg"
      >
        <History className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        alignOffset={-4}
        className="flex h-[min(72vh,560px)] w-[min(420px,calc(100vw-16px))] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-xl"
      >
        <div className="border-b px-3 py-2.5">
          <p className="font-heading text-sm font-semibold">Recent chats</p>
          <p className="text-xs text-muted-foreground">Search and open a conversation</p>
        </div>
        <ChatSearchInput
          inputRef={searchInputRef}
          value={query}
          onChange={onQueryChange}
          placeholder="Search chats..."
          wrapperClassName="relative block shrink-0 border-b px-3 py-2"
          iconClassName="pointer-events-none absolute left-6 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          inputClassName="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
        />
        <div
          id="recent-chats-scroll-area"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [-webkit-overflow-scrolling:touch]"
        >
          <ChatHistoryList
            chats={chats}
            activeChatId={activeChatId}
            hasMore={hasMoreRecents}
            compact
            listClassName="space-y-1"
            scrollTargetId="recent-chats-scroll-area"
            emptyState={
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No chats match your search.
              </p>
            }
            onLoadMore={onLoadMore}
            onSelectChat={onSelectChat}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
