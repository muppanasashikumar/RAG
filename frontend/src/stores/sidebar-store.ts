import { create } from "zustand";

import { chats } from "@/components/rag";
import type { Chat } from "@/components/rag/chat/types";

type SidebarState = {
  query: string;
  activeChat: Chat;
  isSidebarCollapsed: boolean;
  setQuery: (query: string) => void;
  setActiveChat: (chat: Chat) => void;
  toggleSidebar: () => void;
};

export const useSidebarStore = create<SidebarState>((set) => ({
  query: "",
  activeChat: chats[0],
  isSidebarCollapsed: false,

  setQuery: (query) => set({ query }),
  setActiveChat: (activeChat) => set({ activeChat }),
  toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
}));

export function getFilteredChats(query: string) {
  return chats.filter((chat) =>
    `${chat.title} ${chat.source}`.toLowerCase().includes(query.toLowerCase()),
  );
}
