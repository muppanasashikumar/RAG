import { beforeEach, describe, expect, it } from "vitest";

import { chats } from "@/components/rag";
import { getFilteredChats, useSidebarStore } from "@/stores/sidebar-store";

const initialSidebarState = useSidebarStore.getState();

describe("useSidebarStore", () => {
  beforeEach(() => {
    useSidebarStore.setState(initialSidebarState, true);
  });

  it("hydrates with the first chat as active and no query", () => {
    const state = useSidebarStore.getState();
    expect(state.query).toBe("");
    expect(state.isSidebarCollapsed).toBe(false);
    expect(state.activeChat).toEqual(chats[0]);
  });

  it("setQuery updates the query", () => {
    useSidebarStore.getState().setQuery("policy");
    expect(useSidebarStore.getState().query).toBe("policy");
  });

  it("setActiveChat replaces the active chat", () => {
    const nextChat = chats[1];
    useSidebarStore.getState().setActiveChat(nextChat);
    expect(useSidebarStore.getState().activeChat).toEqual(nextChat);
  });

  it("toggleSidebar flips the collapsed flag", () => {
    const { toggleSidebar } = useSidebarStore.getState();
    toggleSidebar();
    expect(useSidebarStore.getState().isSidebarCollapsed).toBe(true);
    toggleSidebar();
    expect(useSidebarStore.getState().isSidebarCollapsed).toBe(false);
  });
});

describe("getFilteredChats", () => {
  it("returns every chat for an empty query", () => {
    expect(getFilteredChats("")).toHaveLength(chats.length);
  });

  it("matches chat titles case-insensitively", () => {
    const result = getFilteredChats("VENDOR");
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.every((chat) =>
        `${chat.title} ${chat.source}`.toLowerCase().includes("vendor"),
      ),
    ).toBe(true);
  });

  it("matches on the source filename as well", () => {
    const result = getFilteredChats("handbook-2026.pdf");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("onboarding");
  });

  it("returns an empty array when nothing matches", () => {
    expect(getFilteredChats("zzz-definitely-not-a-real-chat-zzz")).toEqual([]);
  });
});
