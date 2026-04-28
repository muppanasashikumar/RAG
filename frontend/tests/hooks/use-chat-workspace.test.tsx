import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useChatWorkspace } from "@/hooks/use-chat-workspace";
import { useChatInputStore } from "@/stores/chat-input-store";
import { useChatMessagesStore } from "@/stores/chat-messages-store";
import { useChatStreamingStore } from "@/stores/chat-streaming-store";
import { useChatUploadStore } from "@/stores/chat-upload-store";
import { useSidebarStore } from "@/stores/sidebar-store";

const initialInputState = useChatInputStore.getState();
const initialMessagesState = useChatMessagesStore.getState();
const initialUploadState = useChatUploadStore.getState();
const initialSidebarState = useSidebarStore.getState();

describe("useChatWorkspace", () => {
  beforeEach(() => {
    useChatInputStore.setState(initialInputState, true);
    useChatMessagesStore.setState(initialMessagesState, true);
    useChatUploadStore.setState(initialUploadState, true);
    useSidebarStore.setState(initialSidebarState, true);
  });

  it("aggregates chat state, prompt state, and AI actions", () => {
    useChatMessagesStore.setState({
      messages: [{ id: "m1", role: "assistant", content: "hello" }],
    });
    useChatUploadStore.setState({ uploadedFileNames: ["security-policy.pdf"] });

    const { result } = renderHook(() => useChatWorkspace());
    expect(result.current.messages).toEqual([{ id: "m1", role: "assistant", content: "hello" }]);
    expect(result.current.prompt).toBe("");
    expect(result.current.uploadedFileNames).toEqual(["security-policy.pdf"]);
    expect(result.current.isReplyStreaming).toBe(false);
    expect(result.current.handleSubmit).toBe(
      useChatMessagesStore.getState().submitPrompt,
    );
    expect(result.current.handleNewChat).toBe(useChatMessagesStore.getState().newChat);
  });

  it("reflects streaming state derived from messages", () => {
    useChatMessagesStore.setState({
      messages: [
        { id: "s", role: "assistant", content: "", isStreaming: true },
      ],
    });
    const { result } = renderHook(() => useChatWorkspace());
    expect(result.current.isReplyStreaming).toBe(true);
  });

  it("handleStopStreaming delegates to streaming store for active chat", () => {
    const stopSpy = vi.fn();
    useChatStreamingStore.setState({ stopStreamingForChat: stopSpy });
    useSidebarStore.setState({
      activeChat: { ...useSidebarStore.getState().activeChat, id: "chat-xyz" },
    });

    const { result } = renderHook(() => useChatWorkspace());
    result.current.handleStopStreaming();

    expect(stopSpy).toHaveBeenCalledWith("chat-xyz", useChatMessagesStore.setState);
  });
});
