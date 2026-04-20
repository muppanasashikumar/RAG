import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { chats } from "@/components/rag";
import { useSidebarState } from "@/hooks/use-sidebar-state";
import { useSidebarStore } from "@/stores/sidebar-store";

const initial = useSidebarStore.getState();

describe("useSidebarState", () => {
  beforeEach(() => {
    useSidebarStore.setState(initial, true);
  });

  it("exposes sidebar store state and actions", () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.query).toBe("");
    expect(result.current.activeChat).toEqual(chats[0]);
    expect(result.current.isSidebarCollapsed).toBe(false);
    expect(result.current.filteredChats).toHaveLength(chats.length);
  });

  it("filteredChats recomputes when query changes", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => {
      result.current.setQuery("vendor");
    });
    expect(result.current.query).toBe("vendor");
    expect(result.current.filteredChats.length).toBeGreaterThan(0);
    expect(
      result.current.filteredChats.every((c) =>
        `${c.title} ${c.source}`.toLowerCase().includes("vendor"),
      ),
    ).toBe(true);
  });

  it("toggleSidebar flips the collapsed flag", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => {
      result.current.toggleSidebar();
    });
    expect(result.current.isSidebarCollapsed).toBe(true);
  });

  it("setActiveChat swaps the active chat", () => {
    const { result } = renderHook(() => useSidebarState());
    act(() => {
      result.current.setActiveChat(chats[2]);
    });
    expect(result.current.activeChat).toEqual(chats[2]);
  });
});
