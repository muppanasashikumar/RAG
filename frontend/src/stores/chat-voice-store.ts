import { create } from "zustand";
import { persist } from "zustand/middleware";

type ChatVoiceState = {
  isTtsEnabled: boolean;
  setTtsEnabled: (enabled: boolean) => void;
};

export const useChatVoiceStore = create<ChatVoiceState>()(
  persist(
    (set) => ({
      isTtsEnabled: false,
      setTtsEnabled: (enabled) => set({ isTtsEnabled: enabled }),
    }),
    {
      name: "chat-voice-store",
      partialize: (state) => ({ isTtsEnabled: state.isTtsEnabled }),
    },
  ),
);
