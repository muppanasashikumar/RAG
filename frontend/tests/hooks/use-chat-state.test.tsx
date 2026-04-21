import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { starterMessages } from "@/components/rag";
import { useChatState } from "@/hooks/use-chat-state";
import { useChatStore } from "@/stores/chat-store";

const initial = useChatStore.getState();

describe("useChatState", () => {
  beforeEach(() => {
    useChatStore.setState({ ...initial, messages: [...starterMessages] }, true);
  });

  it("exposes the current chat-store slice", () => {
    const { result } = renderHook(() => useChatState());
    expect(result.current.messages).toEqual(starterMessages);
    expect(result.current.prompt).toBe("");
    expect(result.current.uploadedFileName).toBe("security-policy.pdf");
    expect(typeof result.current.setPrompt).toBe("function");
    expect(typeof result.current.setUploadedFile).toBe("function");
  });

  it("setPrompt mutates the store and re-renders", () => {
    const { result } = renderHook(() => useChatState());
    act(() => {
      result.current.setPrompt("hi");
    });
    expect(result.current.prompt).toBe("hi");
    expect(useChatStore.getState().prompt).toBe("hi");
  });

  it("setUploadedFile reflects the new file and filename", () => {
    const { result } = renderHook(() => useChatState());
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    act(() => {
      result.current.setUploadedFile(file);
    });
    expect(result.current.uploadedFile).toBe(file);
    expect(result.current.uploadedFileName).toBe("doc.pdf");
  });
});
