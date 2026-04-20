import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-infinite-scroll-component", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="infinite-scroll">{children}</div>
  ),
}));

import { ChatRecentsPopover } from "@/components/rag/sidebar/chat-recents-popover";
import type { Chat } from "@/components/rag/chat/types";

const chat: Chat = {
  id: "a",
  title: "Alpha",
  source: "alpha.pdf",
  updatedAt: "now",
  status: "ready",
  messages: 1,
};

function renderPopover(overrides: Partial<Parameters<typeof ChatRecentsPopover>[0]> = {}) {
  const defaultProps: Parameters<typeof ChatRecentsPopover>[0] = {
    open: false,
    query: "",
    chats: [chat],
    activeChatId: "",
    hasMoreRecents: false,
    searchInputRef: createRef<HTMLInputElement>(),
    onOpenChange: vi.fn(),
    onQueryChange: vi.fn(),
    onLoadMore: vi.fn(),
    onSelectChat: vi.fn(),
  };
  return render(<ChatRecentsPopover {...defaultProps} {...overrides} />);
}

describe("ChatRecentsPopover", () => {
  it("renders just the trigger when closed", () => {
    renderPopover();
    expect(
      screen.getByRole("button", { name: "Recent chats" }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search chats...")).toBeNull();
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("shows the popover content with search and chat list when open", async () => {
    renderPopover({ open: true });
    await waitFor(() => {
      expect(
        screen.getAllByText("Recent chats").length,
      ).toBeGreaterThan(0);
    });
    expect(screen.getByPlaceholderText("Search chats...")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("renders the empty state when no chats match", async () => {
    renderPopover({ open: true, chats: [] });
    await waitFor(() => {
      expect(screen.getByText("No chats match your search.")).toBeInTheDocument();
    });
  });
});
