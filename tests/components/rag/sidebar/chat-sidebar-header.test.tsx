import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatSidebarHeader } from "@/components/rag/sidebar/chat-sidebar-header";

describe("ChatSidebarHeader", () => {
  it("renders the brand and 'New chat' label when expanded", () => {
    render(
      <ChatSidebarHeader
        collapsed={false}
        onNewChat={() => {}}
        onToggleSidebar={() => {}}
      />,
    );

    expect(screen.getByText("Astra RAG")).toBeInTheDocument();
    expect(screen.getByText("Agentic document AI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new chat/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeInTheDocument();
  });

  it("hides the brand copy and shows an 'Expand sidebar' button when collapsed", () => {
    render(
      <ChatSidebarHeader
        collapsed
        onNewChat={() => {}}
        onToggleSidebar={() => {}}
      />,
    );

    expect(screen.queryByText("Astra RAG")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
    const newChat = screen.getByRole("button", { name: /new chat/i });
    expect(newChat.textContent?.trim()).toBe("");
  });

  it("wires onNewChat and onToggleSidebar to their buttons", async () => {
    const onNewChat = vi.fn();
    const onToggleSidebar = vi.fn();
    render(
      <ChatSidebarHeader
        collapsed={false}
        onNewChat={onNewChat}
        onToggleSidebar={onToggleSidebar}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /new chat/i }));
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    );

    expect(onNewChat).toHaveBeenCalledOnce();
    expect(onToggleSidebar).toHaveBeenCalledOnce();
  });
});
