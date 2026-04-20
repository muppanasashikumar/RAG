import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: {
      firstName: "Sashi",
      fullName: "Sashi Kumar",
      primaryEmailAddress: { emailAddress: "sashi@example.com" },
    },
    isLoaded: true,
    isSignedIn: true,
  }),
  UserButton: () => (
    <button type="button" data-testid="clerk-user-button">
      user menu
    </button>
  ),
}));

vi.mock("react-infinite-scroll-component", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="infinite-scroll">{children}</div>
  ),
}));

import { ChatSidebar } from "@/components/rag/sidebar/chat-sidebar";
import type { Chat } from "@/components/rag/chat/types";

const chat: Chat = {
  id: "policy",
  title: "Vendor policy",
  source: "policy.pdf",
  updatedAt: "now",
  status: "ready",
  messages: 1,
};

const makeChats = (n: number): Chat[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c-${i}`,
    title: `Chat ${i}`,
    source: `src-${i}.pdf`,
    updatedAt: `${i}m`,
    status: "ready",
    messages: i,
  }));

function renderSidebar(overrides: Partial<Parameters<typeof ChatSidebar>[0]> = {}) {
  const props: Parameters<typeof ChatSidebar>[0] = {
    isSidebarCollapsed: false,
    query: "",
    onQueryChange: vi.fn(),
    activeChat: chat,
    filteredChats: [chat],
    onSelectChat: vi.fn(),
    onNewChat: vi.fn(),
    onToggleSidebar: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ChatSidebar {...props} />) };
}

describe("ChatSidebar", () => {
  it("renders the brand, search input, and chat list when expanded", () => {
    renderSidebar();
    expect(screen.getByText("Astra RAG")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search chats")).toBeInTheDocument();
    expect(screen.getByText("Chat history")).toBeInTheDocument();
    expect(screen.getByText("Vendor policy")).toBeInTheDocument();
  });

  it("shows the signed-in user's name in the footer", () => {
    renderSidebar();
    expect(screen.getByText("Sashi Kumar")).toBeInTheDocument();
  });

  it("pipes search input changes through onQueryChange", async () => {
    const { props } = renderSidebar();
    await userEvent.type(screen.getByPlaceholderText("Search chats"), "v");
    expect(props.onQueryChange).toHaveBeenCalledWith("v");
  });

  it("shows the 'N / total' summary when only a page is visible", () => {
    const chats = makeChats(30);
    renderSidebar({ filteredChats: chats, activeChat: chats[0] });
    expect(screen.getByText("14 / 30")).toBeInTheDocument();
  });

  it("collapsed mode replaces the search+list with the recents popover trigger and hides the brand", () => {
    renderSidebar({ isSidebarCollapsed: true });
    expect(screen.queryByText("Astra RAG")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recent chats" }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search chats")).not.toBeInTheDocument();
  });

  it("onNewChat fires when the header's 'New chat' button is clicked", async () => {
    const { props } = renderSidebar();
    await userEvent.click(
      screen.getByRole("button", { name: /new chat/i }),
    );
    expect(props.onNewChat).toHaveBeenCalledOnce();
  });

  it("selecting a chat invokes onSelectChat with that chat", async () => {
    const { props } = renderSidebar();
    const button = within(screen.getByTestId("infinite-scroll")).getByRole(
      "button",
      { name: /Vendor policy/ },
    );
    await userEvent.click(button);
    expect(props.onSelectChat).toHaveBeenCalledWith(chat);
  });
});
