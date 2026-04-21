"use client";

import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { getFilteredChats, useSidebarStore } from "@/stores/sidebar-store";

export function useSidebarWorkspace() {
  const {
    query,
    setQuery,
    activeChat,
    setActiveChat,
    recentChats,
    isHydrated,
    hydrateRecentChats,
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
        isSidebarCollapsed: s.isSidebarCollapsed,
        toggleSidebar: s.toggleSidebar,
      })),
    );

  useEffect(() => {
    if (isHydrated) {
      return;
    }
    hydrateRecentChats();
  }, [hydrateRecentChats, isHydrated]);

  const filteredChats = useMemo(() => getFilteredChats(query, recentChats), [query, recentChats]);

  return {
    query,
    setQuery,
    activeChat,
    setActiveChat,
    recentChats,
    isSidebarCollapsed,
    toggleSidebar,
    filteredChats,
  };
}
