import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button, buttonVariants } from "@/components/ui/button";

describe("Button", () => {
  it("renders a button with the default variant classes", () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole("button", { name: "Click me" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("data-slot", "button");
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("h-8");
  });

  it("applies variant and size class tokens via class-variance-authority", () => {
    render(
      <Button variant="outline" size="lg">
        outline
      </Button>,
    );
    const button = screen.getByRole("button", { name: "outline" });
    expect(button.className).toContain("border-border");
    expect(button.className).toContain("h-9");
  });

  it("merges caller-provided className with variant styles", () => {
    render(<Button className="custom-marker">x</Button>);
    expect(screen.getByRole("button")).toHaveClass("custom-marker");
  });

  it("forwards click handlers", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>press</Button>);
    await userEvent.click(screen.getByRole("button", { name: "press" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not invoke click when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        off
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "off" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("buttonVariants returns the same token string as the component", () => {
    const tokens = buttonVariants({ variant: "destructive", size: "sm" });
    expect(tokens).toContain("bg-destructive/10");
    expect(tokens).toContain("h-7");
  });
});
