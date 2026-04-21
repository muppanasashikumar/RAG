import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: { firstName: "Pat", fullName: "Pat Example" },
    isLoaded: true,
    isSignedIn: true,
  }),
  UserButton: () => <button type="button">user menu</button>,
}));

vi.mock("react-infinite-scroll-component", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="infinite-scroll">{children}</div>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/",
}));

// RightPanel relies on next/image + react-dropzone; we only need to verify it mounts.
vi.mock("@/components/rag/right-panel", () => ({
  RightPanel: () => <div data-testid="right-panel" />,
}));

// ChatVoiceDictation uses browser speech APIs; stub with a passthrough.
vi.mock("@/components/rag/chat/chat-voice-dictation", () => ({
  ChatVoiceDictation: ({
    children,
  }: {
    children: (ctx: {
      isListening: boolean;
      speechSupported: boolean;
      micControl: ReactNode;
    }) => ReactNode;
  }) => (
    <>
      {children({
        isListening: false,
        speechSupported: true,
        micControl: <button type="button" aria-label="Start voice input" />,
      })}
    </>
  ),
}));

import Home from "@/app/page";

describe("Home page", () => {
  it("wires the sidebar, chat panel, header, and right panel together", () => {
    render(<Home />);
    // Sidebar
    expect(screen.getByText("Astra RAG")).toBeInTheDocument();
    // Header – default state is a fresh chat
    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent(/untitled document chat/i);
    // Chat panel
    expect(screen.getByText("Document chat")).toBeInTheDocument();
    expect(
      screen.getByText("Ask questions grounded in uploaded files."),
    ).toBeInTheDocument();
    // Right panel stub
    expect(screen.getByTestId("right-panel")).toBeInTheDocument();
  });
});
