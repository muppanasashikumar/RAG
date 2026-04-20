"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { getFilteredChats, useSidebarStore } from "@/stores/sidebar-store";

export function useSidebarWorkspace() {
  const { query, setQuery, activeChat, setActiveChat, isSidebarCollapsed, toggleSidebar } =
    useSidebarStore(
      useShallow((s) => ({
        query: s.query,
        setQuery: s.setQuery,
        activeChat: s.activeChat,
        setActiveChat: s.setActiveChat,
        isSidebarCollapsed: s.isSidebarCollapsed,
        toggleSidebar: s.toggleSidebar,
      })),
    );

  const filteredChats = useMemo(() => getFilteredChats(query), [query]);

  return {
    query,
    setQuery,
    activeChat,
    setActiveChat,
    isSidebarCollapsed,
    toggleSidebar,
    filteredChats,
  };
}
