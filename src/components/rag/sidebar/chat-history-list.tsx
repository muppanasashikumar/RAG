import type { ReactNode } from "react";
import InfiniteScroll from "react-infinite-scroll-component";

import type { Chat } from "@/components/rag/chat/types";
import { ChatHistoryItem } from "@/components/rag/sidebar/chat-history-item";

type ChatHistoryListProps = {
  chats: Chat[];
  activeChatId: string;
  hasMore: boolean;
  compact?: boolean;
  listClassName: string;
  scrollTargetId: string;
  emptyState: ReactNode;
  onLoadMore: () => void;
  onSelectChat: (chat: Chat) => void;
};

export function ChatHistoryList({
  chats,
  activeChatId,
  hasMore,
  compact = false,
  listClassName,
  scrollTargetId,
  emptyState,
  onLoadMore,
  onSelectChat,
}: ChatHistoryListProps) {
  if (chats.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <InfiniteScroll
      dataLength={chats.length}
      next={onLoadMore}
      hasMore={hasMore}
      loader={
        <p className="py-2 text-center text-xs text-muted-foreground">
          Loading more chats...
        </p>
      }
      scrollableTarget={scrollTargetId}
      className={listClassName}
    >
      {chats.map((chat) => (
        <ChatHistoryItem
          key={chat.id}
          chat={chat}
          isActive={activeChatId === chat.id}
          compact={compact}
          onSelect={onSelectChat}
        />
      ))}
    </InfiniteScroll>
  );
}
