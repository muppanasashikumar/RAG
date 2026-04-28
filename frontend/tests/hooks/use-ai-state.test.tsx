import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAIState } from "@/hooks/use-ai-state";
import { useChatMessagesStore } from "@/stores/chat-messages-store";
import { useChatStreamingStore } from "@/stores/chat-streaming-store";
import { useSidebarStore } from "@/stores/sidebar-store";

const initialMessagesState = useChatMessagesStore.getState();
const initialSidebarState = useSidebarStore.getState();

describe("useAIState", () => {
  beforeEach(() => {
    useChatMessagesStore.setState(initialMessagesState, true);
    useSidebarStore.setState(initialSidebarState, true);
  });

  it("reports isReplyStreaming=false when no assistant message is streaming", () => {
    const { result } = renderHook(() => useAIState());
    expect(result.current.isReplyStreaming).toBe(false);
  });

  it("reports isReplyStreaming=true when any assistant message is streaming", () => {
    useChatMessagesStore.setState({
      messages: [
        { id: "x", role: "assistant", content: "", isStreaming: true },
      ],
    });
    const { result } = renderHook(() => useAIState());
    expect(result.current.isReplyStreaming).toBe(true);
  });

  it("exposes store actions", () => {
    const { result } = renderHook(() => useAIState());
    expect(result.current.handleSubmit).toBe(
      useChatMessagesStore.getState().submitPrompt,
    );
    expect(result.current.handleNewChat).toBe(useChatMessagesStore.getState().newChat);
  });

  it("handleStopStreaming delegates to streaming store for active chat", () => {
    const stopSpy = vi.fn();
    useChatStreamingStore.setState({ stopStreamingForChat: stopSpy });
    useSidebarStore.setState({
      activeChat: { ...useSidebarStore.getState().activeChat, id: "chat-123" },
    });

    const { result } = renderHook(() => useAIState());
    result.current.handleStopStreaming();

    expect(stopSpy).toHaveBeenCalledWith("chat-123", useChatMessagesStore.setState);
  });
});
