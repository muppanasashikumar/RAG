import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Keep the DOM simple — we don't care about the scroll wiring here.
vi.mock("react-infinite-scroll-component", () => ({
  default: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div data-testid="infinite-scroll" className={className}>
      {children}
    </div>
  ),
}));

import type { Chat } from "@/components/rag/chat/types";
import { ChatHistoryList } from "@/components/rag/sidebar/chat-history-list";

const chats: Chat[] = [
  {
    id: "a",
    title: "Alpha",
    source: "alpha.pdf",
    updatedAt: "now",
    status: "ready",
    messages: 2,
  },
  {
    id: "b",
    title: "Beta",
    source: "beta.pdf",
    updatedAt: "1m",
    status: "review",
    messages: 5,
  },
];

describe("ChatHistoryList", () => {
  it("renders the empty state when chats is empty", () => {
    render(
      <ChatHistoryList
        chats={[]}
        activeChatId=""
        hasMore={false}
        listClassName="space-y-2"
        scrollTargetId="scroll"
        emptyState={<p>No chats match</p>}
        onLoadMore={() => {}}
        onSelectChat={() => {}}
      />,
    );
    expect(screen.getByText("No chats match")).toBeInTheDocument();
    expect(screen.queryByTestId("infinite-scroll")).not.toBeInTheDocument();
  });

  it("renders one history item per chat", () => {
    render(
      <ChatHistoryList
        chats={chats}
        activeChatId="a"
        hasMore={false}
        listClassName="space-y-2"
        scrollTargetId="scroll"
        emptyState={<p>Empty</p>}
        onLoadMore={() => {}}
        onSelectChat={() => {}}
      />,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByTestId("infinite-scroll")).toHaveClass("space-y-2");
  });

  it("selecting an item invokes onSelectChat with that chat", async () => {
    const onSelect = vi.fn();
    render(
      <ChatHistoryList
        chats={chats}
        activeChatId=""
        hasMore={false}
        listClassName=""
        scrollTargetId="scroll"
        emptyState={<p>Empty</p>}
        onLoadMore={() => {}}
        onSelectChat={onSelect}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(onSelect).toHaveBeenCalledWith(chats[0]);
  });
});
