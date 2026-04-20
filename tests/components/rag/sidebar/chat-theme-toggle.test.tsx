import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ChatThemeToggle } from "@/components/rag/sidebar/chat-theme-toggle";

describe("ChatThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("renders an icon-only button when collapsed, labelled for the next mode", () => {
    render(<ChatThemeToggle collapsed />);
    const button = screen.getByRole("button", {
      name: "Switch to dark mode",
    });
    expect(button).toHaveAttribute("title", "Switch to dark mode");
    expect(button.textContent).toBe("");
  });

  it("renders an expanded button with the same label as text", () => {
    render(<ChatThemeToggle collapsed={false} />);
    const button = screen.getByRole("button", {
      name: "Switch to dark mode",
    });
    expect(button).toHaveTextContent("Switch to dark mode");
  });

  it("clicking toggles the theme label and the documentElement class", async () => {
    render(<ChatThemeToggle collapsed={false} />);
    const button = screen.getByRole("button", {
      name: "Switch to dark mode",
    });
    await userEvent.click(button);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });
});
