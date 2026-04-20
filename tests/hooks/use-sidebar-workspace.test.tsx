import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { chats } from "@/components/rag";
import { useSidebarWorkspace } from "@/hooks/use-sidebar-workspace";
import { useSidebarStore } from "@/stores/sidebar-store";

const initial = useSidebarStore.getState();

describe("useSidebarWorkspace", () => {
  beforeEach(() => {
    useSidebarStore.setState(initial, true);
  });

  it("returns the same shape as the sidebar state hook", () => {
    const { result } = renderHook(() => useSidebarWorkspace());
    expect(result.current.query).toBe("");
    expect(result.current.activeChat).toEqual(chats[0]);
    expect(result.current.isSidebarCollapsed).toBe(false);
    expect(result.current.filteredChats).toHaveLength(chats.length);
  });

  it("setQuery narrows the filtered list", () => {
    const { result } = renderHook(() => useSidebarWorkspace());
    act(() => {
      result.current.setQuery("policy");
    });
    expect(result.current.filteredChats.length).toBeGreaterThan(0);
    expect(result.current.filteredChats.length).toBeLessThan(chats.length);
  });
});
