import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Avoid depending on browser APIs used by the voice dictation child component.
vi.mock("@/components/rag/chat/chat-voice-dictation", () => ({
  ChatVoiceDictation: ({
    children,
  }: {
    children: (ctx: {
      isListening: boolean;
      speechSupported: boolean;
      micControl: React.ReactNode;
    }) => React.ReactNode;
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

import { ChatPanel } from "@/components/rag/chat/chat-panel";
import type { Message } from "@/components/rag/chat/types";

const baseMessages: Message[] = [
  {
    id: "m1",
    role: "assistant",
    content: "Hello there",
    citations: [
      {
        citationId: 1,
        documentId: "doc-1",
        sourceFilename: "doc.pdf",
        pageNumber: 1,
        pdfLinkWithPage: "",
        content: "citation excerpt",
        score: 0.95,
      },
    ],
  },
  { id: "m2", role: "user", content: "What do you mean?" },
];

function renderPanel(overrides: Partial<Parameters<typeof ChatPanel>[0]> = {}) {
  const props: Parameters<typeof ChatPanel>[0] = {
    activeChatId: "chat-1",
    messages: baseMessages,
    prompt: "",
    isReplyStreaming: false,
    isIndexingDocuments: false,
    isTtsEnabled: true,
    onPromptChange: vi.fn(),
    onSubmit: vi.fn((e) => e.preventDefault()),
    onStopStreaming: vi.fn(),
    onTtsEnabledChange: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ChatPanel {...props} />) };
}

describe("ChatPanel", () => {
  beforeEach(() => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak: vi.fn(),
        cancel: vi.fn(),
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class {
        text: string;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    });
  });

  it("renders each message and its citations", () => {
    renderPanel();
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("What do you mean?")).toBeInTheDocument();
    expect(screen.getByText(/doc\.pdf/)).toBeInTheDocument();
  });

  it("renders assistant markdown formatting", () => {
    renderPanel({
      messages: [
        {
          id: "md-1",
          role: "assistant",
          content: "This is **bold** and [docs](https://example.com).",
        },
      ],
    });

    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  it("shows a 'Ready' status chip when idle", () => {
    renderPanel();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText("Streaming")).not.toBeInTheDocument();
  });

  it("shows a 'Streaming' chip and a Stop button while streaming", () => {
    renderPanel({ isReplyStreaming: true });
    expect(screen.getByText("Streaming")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stop generating" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Send")).not.toBeInTheDocument();
  });

  it("disables the Send button when the prompt is empty", () => {
    renderPanel();
    expect(
      screen.getByRole("button", { name: /^send$/i }),
    ).toBeDisabled();
  });

  it("enables the Send button when a prompt is present and submits through the form", async () => {
    const { props } = renderPanel({ prompt: "tell me more" });
    const send = screen.getByRole("button", { name: /^send$/i });
    expect(send).not.toBeDisabled();
    await userEvent.click(send);
    expect(props.onSubmit).toHaveBeenCalled();
  });

  it("clicking the Stop button calls onStopStreaming", async () => {
    const { props } = renderPanel({
      isReplyStreaming: true,
      messages: [
        ...baseMessages,
        { id: "s", role: "assistant", content: "streaming", isStreaming: true },
      ],
    });
    await userEvent.click(screen.getByRole("button", { name: "Stop generating" }));
    expect(props.onStopStreaming).toHaveBeenCalledOnce();
  });

  it("composer input emits onPromptChange as the user types", async () => {
    const onPromptChange = vi.fn();
    renderPanel({ onPromptChange });
    await userEvent.type(
      screen.getByPlaceholderText(/Ask about obligations/),
      "a",
    );
    expect(onPromptChange).toHaveBeenCalledWith("a");
  });

  it("does not auto-speak on render", () => {
    renderPanel();
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
  });

  it("starts read aloud only when user clicks speaker while off", async () => {
    const { props } = renderPanel({ isTtsEnabled: false });
    expect(screen.getByText("Off")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Read aloud off" }));
    expect(props.onTtsEnabledChange).toHaveBeenCalledWith(true);
    expect(window.speechSynthesis.speak).toHaveBeenCalledOnce();
  });

  it("clicking the speaker toggle while on stops read aloud", async () => {
    const { props } = renderPanel({ isTtsEnabled: true });
    expect(screen.getByText("On")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Read aloud on" }));
    expect(props.onTtsEnabledChange).toHaveBeenCalledWith(false);
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });

});
