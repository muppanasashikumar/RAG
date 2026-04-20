import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SpeechHookReturn = {
  browserSupportsSpeechRecognition: boolean;
  finalTranscript: string;
  interimTranscript: string;
  listening: boolean;
  isMicrophoneAvailable: boolean;
  resetTranscript: () => void;
};

const speechHookState: SpeechHookReturn = {
  browserSupportsSpeechRecognition: true,
  finalTranscript: "",
  interimTranscript: "",
  listening: false,
  isMicrophoneAvailable: true,
  resetTranscript: vi.fn(),
};

const startListening = vi.fn().mockResolvedValue(undefined);
const stopListening = vi.fn().mockResolvedValue(undefined);
const abortListening = vi.fn().mockResolvedValue(undefined);

vi.mock("react-speech-recognition", () => ({
  default: {
    startListening: (...args: unknown[]) => startListening(...args),
    stopListening: () => stopListening(),
    abortListening: () => abortListening(),
  },
  useSpeechRecognition: () => speechHookState,
}));

import { ChatVoiceDictation } from "@/components/rag/chat/chat-voice-dictation";
import type { ChatVoiceDictationRenderContext } from "@/components/rag/chat/types";

function Harness({
  prompt = "",
  onPromptChange = () => {},
  isReplyStreaming = false,
  onListeningChange,
}: {
  prompt?: string;
  onPromptChange?: (value: string) => void;
  isReplyStreaming?: boolean;
  onListeningChange?: (listening: boolean) => void;
}) {
  return (
    <ChatVoiceDictation
      prompt={prompt}
      onPromptChange={onPromptChange}
      isReplyStreaming={isReplyStreaming}
      onListeningChange={onListeningChange}
    >
      {({ isListening, speechSupported, micControl }: ChatVoiceDictationRenderContext): ReactNode => (
        <div>
          <span data-testid="is-listening">{String(isListening)}</span>
          <span data-testid="speech-supported">{String(speechSupported)}</span>
          {micControl}
        </div>
      )}
    </ChatVoiceDictation>
  );
}

function resetSpeechState() {
  speechHookState.browserSupportsSpeechRecognition = true;
  speechHookState.finalTranscript = "";
  speechHookState.interimTranscript = "";
  speechHookState.listening = false;
  speechHookState.isMicrophoneAvailable = true;
  speechHookState.resetTranscript = vi.fn();
}

describe("ChatVoiceDictation", () => {
  beforeEach(() => {
    resetSpeechState();
    startListening.mockClear();
    stopListening.mockClear();
    abortListening.mockClear();

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the mic control labelled 'Start voice input' when idle", async () => {
    render(<Harness />);
    await waitFor(() => {
      expect(screen.getByTestId("speech-supported").textContent).toBe("true");
    });
    expect(
      screen.getByRole("button", { name: "Start voice input" }),
    ).toBeInTheDocument();
  });

  it("warns the user when the browser does not support speech recognition", async () => {
    speechHookState.browserSupportsSpeechRecognition = false;
    render(<Harness />);
    await waitFor(() => {
      expect(
        screen.getByText(
          /Voice input requires a Chromium-based browser/i,
        ),
      ).toBeInTheDocument();
    });
    const button = screen.getByRole("button", { name: "Start voice input" });
    expect(button).toBeDisabled();
  });

  it("disables the mic button while a reply is streaming", async () => {
    render(<Harness isReplyStreaming />);
    await waitFor(() => {
      expect(screen.getByTestId("speech-supported").textContent).toBe("true");
    });
    expect(
      screen.getByRole("button", { name: "Start voice input" }),
    ).toBeDisabled();
  });

  it("starts listening on click and requests microphone access", async () => {
    render(<Harness prompt="hello" />);
    await waitFor(() =>
      expect(screen.getByTestId("speech-supported").textContent).toBe("true"),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Start voice input" }),
    );

    await waitFor(() => {
      expect(startListening).toHaveBeenCalledWith({
        continuous: true,
        language: "en-US",
      });
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it("shows a microphone error when permission is denied", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId("speech-supported").textContent).toBe("true"),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Start voice input" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Microphone permission denied."),
      ).toBeInTheDocument();
    });
    expect(startListening).not.toHaveBeenCalled();
  });

  it("shows the listening banner and stop button when recognition is active", async () => {
    speechHookState.listening = true;
    render(<Harness />);
    await waitFor(() => {
      expect(screen.getByText("Listening")).toBeInTheDocument();
    });
    expect(screen.getByTestId("is-listening").textContent).toBe("true");
    expect(
      screen.getByRole("button", { name: "Stop voice input" }),
    ).toBeInTheDocument();
  });

  it("clicking the mic while listening stops recognition", async () => {
    speechHookState.listening = true;
    render(<Harness />);
    await waitFor(() => {
      expect(screen.getByTestId("is-listening").textContent).toBe("true");
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Stop voice input" }),
    );
    expect(stopListening).toHaveBeenCalled();
  });
});
