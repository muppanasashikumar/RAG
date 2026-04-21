import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatHistoryItem } from "@/components/rag/sidebar/chat-history-item";
import type { Chat } from "@/components/rag/chat/types";

const chat: Chat = {
  id: "policy",
  title: "Vendor security policy review",
  source: "security-policy.pdf",
  updatedAt: "2 min ago",
  status: "ready",
  messages: 18,
};

describe("ChatHistoryItem", () => {
  it("displays the chat title, source, updatedAt, messages, and status label", () => {
    render(
      <ChatHistoryItem chat={chat} isActive={false} onSelect={() => {}} />,
    );
    expect(screen.getByText(chat.title)).toBeInTheDocument();
    expect(screen.getByText(chat.source)).toBeInTheDocument();
    expect(screen.getByText(chat.updatedAt)).toBeInTheDocument();
    expect(screen.getByText("18 messages")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("highlights the active chat", () => {
    render(
      <ChatHistoryItem chat={chat} isActive onSelect={() => {}} />,
    );
    const button = screen.getByRole("button", { name: /vendor security policy/i });
    expect(button.className).toContain("border-ring");
    expect(button.className).toContain("bg-muted");
  });

  it("calls onSelect with the chat when clicked", async () => {
    const onSelect = vi.fn();
    render(<ChatHistoryItem chat={chat} isActive={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(chat);
  });

  it("applies the compact padding class in compact mode", () => {
    render(
      <ChatHistoryItem chat={chat} isActive={false} compact onSelect={() => {}} />,
    );
    const button = screen.getByRole("button");
    expect(button.className).toContain("px-3");
    expect(button.className).toContain("py-2.5");
  });

  it("renders the correct status label for non-ready statuses", () => {
    render(
      <ChatHistoryItem
        chat={{ ...chat, status: "indexing" }}
        isActive={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("Indexing")).toBeInTheDocument();
  });
});
