import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { starterMessages } from "@/components/rag";
import { useAIState } from "@/hooks/use-ai-state";
import { useChatStore } from "@/stores/chat-store";

const initial = useChatStore.getState();

describe("useAIState", () => {
  beforeEach(() => {
    useChatStore.setState({ ...initial, messages: [...starterMessages] }, true);
  });

  it("reports isReplyStreaming=false when no assistant message is streaming", () => {
    const { result } = renderHook(() => useAIState());
    expect(result.current.isReplyStreaming).toBe(false);
  });

  it("reports isReplyStreaming=true when any assistant message is streaming", () => {
    useChatStore.setState({
      messages: [
        ...starterMessages,
        { id: "x", role: "assistant", content: "", isStreaming: true },
      ],
    });
    const { result } = renderHook(() => useAIState());
    expect(result.current.isReplyStreaming).toBe(true);
  });

  it("exposes store actions", () => {
    const { result } = renderHook(() => useAIState());
    expect(result.current.handleSubmit).toBe(
      useChatStore.getState().submitPrompt,
    );
    expect(result.current.handleStopStreaming).toBe(
      useChatStore.getState().stopStreaming,
    );
    expect(result.current.handleNewChat).toBe(useChatStore.getState().newChat);
  });

  it("calls dispose on unmount", () => {
    const disposeSpy = vi.fn();
    useChatStore.setState({ dispose: disposeSpy });

    const { unmount } = renderHook(() => useAIState());
    unmount();

    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});
