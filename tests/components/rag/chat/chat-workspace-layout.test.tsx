import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: null, isLoaded: true, isSignedIn: false }),
  UserButton: () => <button type="button">user menu</button>,
}));

vi.mock("react-infinite-scroll-component", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="infinite-scroll">{children}</div>
  ),
}));

import { ChatWorkspaceLayout } from "@/components/rag/chat/chat-workspace-layout";
import type { Chat } from "@/components/rag/chat/types";

const chat: Chat = {
  id: "p",
  title: "Vendor policy",
  source: "policy.pdf",
  updatedAt: "now",
  status: "ready",
  messages: 3,
};

describe("ChatWorkspaceLayout", () => {
  it("renders the sidebar, header title, and nested children", () => {
    render(
      <ChatWorkspaceLayout
        isSidebarCollapsed={false}
        query=""
        onQueryChange={() => {}}
        activeChat={chat}
        filteredChats={[chat]}
        onSelectChat={() => {}}
        onNewChat={() => {}}
        onToggleSidebar={() => {}}
      >
        <div>child-content</div>
      </ChatWorkspaceLayout>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: chat.title }),
    ).toBeInTheDocument();
    expect(screen.getByText("child-content")).toBeInTheDocument();
    expect(screen.getByText("Astra RAG")).toBeInTheDocument();
  });

  it("uses a narrow left column when the sidebar is collapsed", () => {
    const { container } = render(
      <ChatWorkspaceLayout
        isSidebarCollapsed
        query=""
        onQueryChange={() => {}}
        activeChat={chat}
        filteredChats={[chat]}
        onSelectChat={() => {}}
        onNewChat={() => {}}
        onToggleSidebar={() => {}}
      >
        <div />
      </ChatWorkspaceLayout>,
    );
    const grid = container.querySelector('[class*="grid-cols-[96px_1fr]"]');
    expect(grid).not.toBeNull();
  });
});
