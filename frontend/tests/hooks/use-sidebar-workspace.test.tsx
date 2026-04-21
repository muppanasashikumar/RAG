import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { Chat } from "@/components/rag/chat/types";
import { useSidebarWorkspace } from "@/hooks/use-sidebar-workspace";
import { useSidebarStore } from "@/stores/sidebar-store";

const initial = useSidebarStore.getState();
const chats: Chat[] = [
  {
    id: "policy",
    title: "Vendor security policy review",
    source: "security-policy.pdf",
    updatedAt: "2026-04-21T00:00:00.000Z",
    status: "ready",
    messages: 18,
  },
  {
    id: "onboarding",
    title: "Employee handbook Q&A",
    source: "handbook-2026.pdf",
    updatedAt: "2026-04-20T00:00:00.000Z",
    status: "indexing",
    messages: 6,
  },
];

describe("useSidebarWorkspace", () => {
  beforeEach(() => {
    useSidebarStore.setState(initial, true);
    useSidebarStore.setState({ recentChats: chats, activeChat: chats[0], isHydrated: true });
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
