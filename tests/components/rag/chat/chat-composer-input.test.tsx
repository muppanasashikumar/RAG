import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatComposerInput } from "@/components/rag/chat/chat-composer-input";

describe("ChatComposerInput", () => {
  it("renders the idle placeholder when not listening", () => {
    render(
      <ChatComposerInput
        value=""
        onChange={() => {}}
        readOnly={false}
        isListening={false}
        idlePlaceholder="idle"
        listeningPlaceholder="listening"
      />,
    );
    const input = screen.getByPlaceholderText("idle") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.readOnly).toBe(false);
  });

  it("renders the listening placeholder and adds the destructive ring classes", () => {
    render(
      <ChatComposerInput
        value=""
        onChange={() => {}}
        readOnly
        isListening
        idlePlaceholder="idle"
        listeningPlaceholder="listening"
      />,
    );
    const input = screen.getByPlaceholderText("listening") as HTMLInputElement;
    expect(input.className).toContain("border-destructive/35");
    expect(input.readOnly).toBe(true);
  });

  it("emits the new value through onChange when the user types", async () => {
    const onChange = vi.fn();
    render(
      <ChatComposerInput
        value=""
        onChange={onChange}
        readOnly={false}
        isListening={false}
        idlePlaceholder="idle"
        listeningPlaceholder="listening"
      />,
    );

    await userEvent.type(screen.getByPlaceholderText("idle"), "hi");
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith("i");
  });
});
