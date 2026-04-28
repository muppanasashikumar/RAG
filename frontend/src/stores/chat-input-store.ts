import { create } from "zustand";

import type { ChatInputState } from "@/stores/chat-store.typings";

export const useChatInputStore = create<ChatInputState>((set) => ({
  prompt: "",
  setPrompt: (prompt) => set({ prompt }),
}));
