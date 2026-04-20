import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { starterMessages } from "@/components/rag";
import { useChatWorkspace } from "@/hooks/use-chat-workspace";
import { useChatStore } from "@/stores/chat-store";

const initial = useChatStore.getState();

describe("useChatWorkspace", () => {
  beforeEach(() => {
    useChatStore.setState({ ...initial, messages: [...starterMessages] }, true);
  });

  it("aggregates chat state, prompt state, and AI actions", () => {
    const { result } = renderHook(() => useChatWorkspace());
    expect(result.current.messages).toEqual(starterMessages);
    expect(result.current.prompt).toBe("");
    expect(result.current.uploadedFileName).toBe("security-policy.pdf");
    expect(result.current.isReplyStreaming).toBe(false);
    expect(result.current.handleSubmit).toBe(
      useChatStore.getState().submitPrompt,
    );
    expect(result.current.handleStopStreaming).toBe(
      useChatStore.getState().stopStreaming,
    );
    expect(result.current.handleNewChat).toBe(useChatStore.getState().newChat);
  });

  it("reflects streaming state derived from messages", () => {
    useChatStore.setState({
      messages: [
        ...starterMessages,
        { id: "s", role: "assistant", content: "", isStreaming: true },
      ],
    });
    const { result } = renderHook(() => useChatWorkspace());
    expect(result.current.isReplyStreaming).toBe(true);
  });

  it("calls dispose on unmount", () => {
    const disposeSpy = vi.fn();
    useChatStore.setState({ dispose: disposeSpy });

    const { unmount } = renderHook(() => useChatWorkspace());
    unmount();

    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});
