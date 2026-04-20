import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => (
    <button type="button" data-testid="clerk-user-button">
      user menu
    </button>
  ),
}));

import { ChatSidebarFooter } from "@/components/rag/sidebar/chat-sidebar-footer";

describe("ChatSidebarFooter", () => {
  it("shows the user name and initial when expanded", () => {
    render(
      <ChatSidebarFooter
        collapsed={false}
        userLabel="Sashi Kumar"
        userInitial="s"
      />,
    );

    expect(screen.getByText("Sashi Kumar")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
    expect(screen.getByTestId("clerk-user-button")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Switch to (dark|light) mode/ }),
    ).toBeInTheDocument();
  });

  it("hides the user label in collapsed mode but still mounts the user menu and theme toggle", () => {
    render(
      <ChatSidebarFooter
        collapsed
        userLabel="Sashi Kumar"
        userInitial="s"
      />,
    );

    expect(screen.queryByText("Sashi Kumar")).not.toBeInTheDocument();
    expect(screen.getByTestId("clerk-user-button")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Switch to (dark|light) mode/ }),
    ).toBeInTheDocument();
  });
});
