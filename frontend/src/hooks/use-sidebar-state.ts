"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { getFilteredChats, useSidebarStore } from "@/stores/sidebar-store";

export function useSidebarState() {
  const {
    query,
    setQuery,
    activeChat,
    setActiveChat,
    recentChats,
    isHydrated,
    hydrateRecentChats,
    hasMoreRecents,
    fetchMoreRecentChats,
    isSidebarCollapsed,
    toggleSidebar,
  } =
    useSidebarStore(
      useShallow((s) => ({
        query: s.query,
        setQuery: s.setQuery,
        activeChat: s.activeChat,
        setActiveChat: s.setActiveChat,
        recentChats: s.recentChats,
        isHydrated: s.isHydrated,
        hydrateRecentChats: s.hydrateRecentChats,
        hasMoreRecents: s.hasMoreRecents,
        fetchMoreRecentChats: s.fetchMoreRecentChats,
        isSidebarCollapsed: s.isSidebarCollapsed,
        toggleSidebar: s.toggleSidebar,
      })),
    );

  const filteredChats = useMemo(() => getFilteredChats(query, recentChats), [query, recentChats]);

  return {
    query,
    setQuery,
    activeChat,
    setActiveChat,
    recentChats,
    isHydrated,
    hydrateRecentChats,
    hasMoreRecents,
    fetchMoreRecentChats,
    isSidebarCollapsed,
    toggleSidebar,
    filteredChats,
  };
}
