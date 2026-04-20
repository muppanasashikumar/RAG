import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChatSearchInput } from "@/components/rag/sidebar/chat-search-input";

describe("ChatSearchInput", () => {
  function renderInput(overrides: Partial<Parameters<typeof ChatSearchInput>[0]> = {}) {
    const onChange = vi.fn();
    const utils = render(
      <ChatSearchInput
        value=""
        placeholder="Search chats"
        inputClassName="input-class"
        wrapperClassName="wrapper-class"
        iconClassName="icon-class"
        onChange={onChange}
        {...overrides}
      />,
    );
    return { onChange, ...utils };
  }

  it("renders a labelled input with the configured placeholder and value", () => {
    renderInput({ value: "policy" });
    const input = screen.getByPlaceholderText("Search chats") as HTMLInputElement;
    expect(input.value).toBe("policy");
    expect(input).toHaveClass("input-class");
  });

  it("fires onChange with the next value when the user types", async () => {
    const { onChange } = renderInput();
    const input = screen.getByPlaceholderText("Search chats");
    await userEvent.type(input, "abc");
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith("c");
  });

  it("supports a forwarded input ref for focus control", () => {
    const ref = createRef<HTMLInputElement>();
    renderInput({ inputRef: ref });
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
