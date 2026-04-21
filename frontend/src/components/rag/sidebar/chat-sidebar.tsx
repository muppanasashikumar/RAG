import { History } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ChatSidebarProps } from "@/components/rag/chat/types";
import { ChatSidebarHeader } from "./chat-sidebar-header";
import { ChatRecentsPopover } from "./chat-recents-popover";
import { ChatSidebarFooter } from "./chat-sidebar-footer";
import { ChatSearchInput } from "./chat-search-input";
import { ChatHistoryList } from "./chat-history-list";


const RECENTS_PAGE_SIZE = 14;

export function ChatSidebar({
  isSidebarCollapsed,
  query,
  onQueryChange,
  activeChat,
  filteredChats,
  onSelectChat,
  onNewChat,
  onToggleSidebar,
}: ChatSidebarProps) {
  const { user } = useUser();
  const popoverSearchRef = useRef<HTMLInputElement>(null);
  const [recentsMenuOpen, setRecentsMenuOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(RECENTS_PAGE_SIZE, filteredChats.length),
  );

  const clampedVisible = Math.min(visibleCount, filteredChats.length);
  const visibleChats = filteredChats.slice(0, clampedVisible);
  const hasMoreRecents = clampedVisible < filteredChats.length;
  const userLabel = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Signed in user";
  const userInitial =
    user?.firstName?.[0] ??
    user?.fullName?.[0] ??
    user?.primaryEmailAddress?.emailAddress?.[0] ??
    "U";
  const appendRecentsPage = useCallback(() => {
    setVisibleCount((current) => Math.min(current + RECENTS_PAGE_SIZE, filteredChats.length));
  }, [filteredChats.length]);

  const handleQueryChange = useCallback(
    (nextQuery: string) => {
      setVisibleCount(Math.min(RECENTS_PAGE_SIZE, filteredChats.length));
      onQueryChange(nextQuery);
    },
    [filteredChats.length, onQueryChange],
  );

  useEffect(() => {
    if (!recentsMenuOpen || !isSidebarCollapsed) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      popoverSearchRef.current?.focus();
      popoverSearchRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [isSidebarCollapsed, recentsMenuOpen]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-b bg-background lg:border-b-0 lg:border-r">
      <div className="flex h-full min-h-0 flex-col">
        <ChatSidebarHeader
          collapsed={isSidebarCollapsed}
          onNewChat={onNewChat}
          onToggleSidebar={onToggleSidebar}
        />

        {isSidebarCollapsed ? (
          <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
            <ChatRecentsPopover
              open={isSidebarCollapsed ? recentsMenuOpen : false}
              query={query}
              chats={visibleChats}
              activeChatId={activeChat.id}
              hasMoreRecents={hasMoreRecents}
              searchInputRef={popoverSearchRef}
              onOpenChange={setRecentsMenuOpen}
              onQueryChange={handleQueryChange}
              onLoadMore={appendRecentsPage}
              onSelectChat={(chat) => {
                onSelectChat(chat);
                setRecentsMenuOpen(false);
              }}
            />
            <ChatSidebarFooter collapsed userLabel={userLabel} userInitial={userInitial} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-5">
            <ChatSearchInput
              value={query}
              onChange={handleQueryChange}
              placeholder="Search chats"
              wrapperClassName="relative block shrink-0"
              iconClassName="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              inputClassName="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-ring focus:ring-3 focus:ring-ring/20"
            />

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="mb-3 flex shrink-0 items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <History className="size-4" aria-hidden="true" />
                  Chat history
                </p>
                <span className="text-xs text-muted-foreground" title="Matches your search">
                  {visibleChats.length === filteredChats.length
                    ? filteredChats.length
                    : `${visibleChats.length} / ${filteredChats.length}`}
                </span>
              </div>

              <div
                id="expanded-chats-scroll-area"
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]"
              >
                <ChatHistoryList
                  chats={visibleChats}
                  activeChatId={activeChat.id}
                  hasMore={hasMoreRecents}
                  listClassName="space-y-2"
                  scrollTargetId="expanded-chats-scroll-area"
                  emptyState={
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No chats match your search.
                    </p>
                  }
                  onLoadMore={appendRecentsPage}
                  onSelectChat={onSelectChat}
                />
              </div>
            </div>

            <ChatSidebarFooter collapsed={false} userLabel={userLabel} userInitial={userInitial} />
          </div>
        )}
      </div>
    </aside>
  );
}
