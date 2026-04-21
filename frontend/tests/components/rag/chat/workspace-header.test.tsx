import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspaceHeader } from "@/components/rag/chat/workspace-header";

describe("WorkspaceHeader", () => {
  it("renders the active chat title as the heading", () => {
    render(<WorkspaceHeader activeChatTitle="Renewal terms" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Renewal terms" }),
    ).toBeInTheDocument();
  });

  it("renders the stat tiles with stable copy", () => {
    render(<WorkspaceHeader activeChatTitle="x" />);
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Retrieval mode")).toBeInTheDocument();
    expect(screen.getByText("Hybrid search")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("12 indexed")).toBeInTheDocument();
    expect(screen.getByText("Guardrails")).toBeInTheDocument();
    expect(screen.getByText("Citations required")).toBeInTheDocument();
  });
});
