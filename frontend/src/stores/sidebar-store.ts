import { create } from "zustand";

import type { Chat } from "@/components/rag/chat/types";

const RECENT_CHATS_STORAGE_KEY = "rag-recent-chats";
const RECENTS_PAGE_SIZE = 20;
const BACKEND_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_API_URL?.trim() || "http://localhost:8000";
const LEGACY_MOCK_CHAT_IDS = new Set(["policy", "contract", "research", "onboarding"]);

function isLegacyMockChat(chat: Chat): boolean {
  if (LEGACY_MOCK_CHAT_IDS.has(chat.id) || chat.id.startsWith("recent-")) {
    return true;
  }
  return /^workspace\/docs-\d+\.pdf$/i.test(chat.source);
}

function normalizeRecentChats(value: unknown): Chat[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Chat => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const chat = item as Partial<Chat>;
      return (
        typeof chat.id === "string" &&
        typeof chat.title === "string" &&
        typeof chat.source === "string" &&
        typeof chat.updatedAt === "string" &&
        (chat.status === "ready" || chat.status === "indexing" || chat.status === "review") &&
        typeof chat.messages === "number"
      );
    })
    .slice(0, 100);
}

function readStoredRecentChats(): Chat[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(RECENT_CHATS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return normalizeRecentChats(JSON.parse(raw)).filter((chat) => !isLegacyMockChat(chat));
  } catch {
    return [];
  }
}

function writeStoredRecentChats(value: Chat[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(RECENT_CHATS_STORAGE_KEY, JSON.stringify(value));
}

function mergeRecentChats(incoming: Chat[]): Chat[] {
  const seed = [...incoming];
  const seen = new Set<string>();
  const merged: Chat[] = [];
  for (const chat of seed) {
    if (seen.has(chat.id)) {
      continue;
    }
    seen.add(chat.id);
    merged.push(chat);
  }
  return merged;
}

function normalizeServerChat(value: unknown): Chat | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as {
    id?: unknown;
    title?: unknown;
    source?: unknown;
    updated_at?: unknown;
    status?: unknown;
    messages?: unknown;
  };
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.source !== "string" ||
    typeof raw.updated_at !== "string" ||
    typeof raw.messages !== "number"
  ) {
    return null;
  }
  const status: Chat["status"] =
    raw.status === "indexing" || raw.status === "review" ? raw.status : "ready";
  return {
    id: raw.id,
    title: raw.title,
    source: raw.source,
    updatedAt: raw.updated_at,
    status,
    messages: raw.messages,
  };
}

type SidebarState = {
  query: string;
  activeChat: Chat;
  recentChats: Chat[];
  isHydrated: boolean;
  recentsOffset: number;
  hasMoreRecents: boolean;
  isLoadingRecents: boolean;
  isSidebarCollapsed: boolean;
  setQuery: (query: string) => void;
  setActiveChat: (chat: Chat) => void;
  hydrateRecentChats: () => void;
  fetchMoreRecentChats: () => Promise<void>;
  upsertRecentChat: (chat: Chat) => void;
  toggleSidebar: () => void;
};

export const useSidebarStore = create<SidebarState>((set, get) => ({
  query: "",
  activeChat: {
    id: "new",
    title: "Untitled document chat",
    source: "No document uploaded",
    updatedAt: "Now",
    status: "ready",
    messages: 0,
  },
  recentChats: [],
  isHydrated: false,
  recentsOffset: 0,
  hasMoreRecents: true,
  isLoadingRecents: false,
  isSidebarCollapsed: false,

  setQuery: (query) => set({ query }),
  setActiveChat: (activeChat) => set({ activeChat }),
  hydrateRecentChats: () => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = readStoredRecentChats();
    const merged = mergeRecentChats(stored);
    set((state) => ({
      recentChats: merged,
      activeChat:
        merged.find((chat) => chat.id === state.activeChat.id) ?? state.activeChat,
      isHydrated: true,
      recentsOffset: 0,
      hasMoreRecents: true,
    }));
    void get().fetchMoreRecentChats();
  },
  fetchMoreRecentChats: async () => {
    const state = get();
    if (state.isLoadingRecents || !state.hasMoreRecents) {
      return;
    }
    set({ isLoadingRecents: true });
    try {
      const response = await fetch(
        `${BACKEND_API_URL}/api/v1/rag/chats?limit=${RECENTS_PAGE_SIZE}&offset=${state.recentsOffset}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch recents");
      }
      const payload = (await response.json()) as { chats?: unknown[] };
      const incoming = Array.isArray(payload.chats)
        ? payload.chats
            .map((chat) => normalizeServerChat(chat))
            .filter((chat): chat is Chat => chat !== null)
        : [];
      set((current) => {
        const next = mergeRecentChats([...incoming, ...current.recentChats]);
        writeStoredRecentChats(next);
        return {
          recentChats: next,
          recentsOffset: current.recentsOffset + incoming.length,
          hasMoreRecents: incoming.length === RECENTS_PAGE_SIZE,
          isLoadingRecents: false,
        };
      });
    } catch {
      set({ isLoadingRecents: false, hasMoreRecents: false });
    }
  },
  upsertRecentChat: (chat) =>
    set((state) => {
      const next = [chat, ...state.recentChats.filter((item) => item.id !== chat.id)];
      writeStoredRecentChats(next);
      return {
        recentChats: next,
        activeChat: chat,
      };
    }),
  toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
}));

export function getFilteredChats(query: string, recentChats: Chat[]) {
  return recentChats.filter((chat) =>
    `${chat.title} ${chat.source}`.toLowerCase().includes(query.toLowerCase()),
  );
}
