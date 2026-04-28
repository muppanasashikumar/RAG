import { beforeEach, describe, expect, it } from "vitest";

import { useChatVoiceStore } from "@/stores/chat-voice-store";

describe("chat voice store", () => {
  beforeEach(() => {
    useChatVoiceStore.setState({ isTtsEnabled: false });
  });

  it("defaults to muted voice playback", () => {
    expect(useChatVoiceStore.getState().isTtsEnabled).toBe(false);
  });

  it("updates voice playback preference", () => {
    useChatVoiceStore.getState().setTtsEnabled(true);
    expect(useChatVoiceStore.getState().isTtsEnabled).toBe(true);
  });
});
