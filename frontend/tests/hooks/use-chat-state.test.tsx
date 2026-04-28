import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useChatState } from "@/hooks/use-chat-state";
import { useChatInputStore } from "@/stores/chat-input-store";
import { useChatMessagesStore } from "@/stores/chat-messages-store";
import { useChatUploadStore } from "@/stores/chat-upload-store";

const initialInputState = useChatInputStore.getState();
const initialMessagesState = useChatMessagesStore.getState();
const initialUploadState = useChatUploadStore.getState();

describe("useChatState", () => {
  beforeEach(() => {
    useChatInputStore.setState(initialInputState, true);
    useChatMessagesStore.setState(initialMessagesState, true);
    useChatUploadStore.setState(initialUploadState, true);
  });

  it("exposes the composed split-store slice", () => {
    useChatMessagesStore.setState({
      messages: [{ id: "m1", role: "assistant", content: "hello" }],
    });
    useChatUploadStore.setState({
      uploadedFileNames: ["security-policy.pdf"],
    });

    const { result } = renderHook(() => useChatState());
    expect(result.current.messages).toEqual([{ id: "m1", role: "assistant", content: "hello" }]);
    expect(result.current.prompt).toBe("");
    expect(result.current.uploadedFileNames).toEqual(["security-policy.pdf"]);
    expect(typeof result.current.setPrompt).toBe("function");
    expect(typeof result.current.uploadBatchFiles).toBe("function");
  });

  it("setPrompt mutates the store and re-renders", () => {
    const { result } = renderHook(() => useChatState());
    act(() => {
      result.current.setPrompt("hi");
    });
    expect(result.current.prompt).toBe("hi");
    expect(useChatInputStore.getState().prompt).toBe("hi");
  });

  it("clearUploadedFiles resets upload state", () => {
    const { result } = renderHook(() => useChatState());
    act(() => {
      useChatUploadStore.setState({
        uploadedFiles: [new File(["x"], "doc.pdf", { type: "application/pdf" })],
        uploadedFileNames: ["doc.pdf"],
        uploadStatuses: [{ fileName: "doc.pdf", status: "indexed" }],
      });
    });

    act(() => {
      result.current.clearUploadedFiles();
    });

    expect(result.current.uploadedFiles).toEqual([]);
    expect(result.current.uploadedFileNames).toEqual([]);
    expect(result.current.uploadStatuses).toEqual([]);
  });
});
