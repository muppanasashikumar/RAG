import { Mic } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";

import type {
  ChatVoiceDictationProps,
} from "@/components/rag/chat/types";
import { Button } from "@/components/ui/button";

function VoiceWaveform({ active }: { active: boolean }) {
  return (
    <div className="flex h-5 items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`h-5 w-1 rounded-full bg-destructive/80 ${
            active ? "animate-voice-bar" : "scale-y-[0.2] opacity-40"
          }`}
          style={active ? { animationDelay: `${i * 90}ms` } : undefined}
        />
      ))}
    </div>
  );
}

function VoiceListeningBanner() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <VoiceWaveform active />
        <div className="min-w-0">
          <p className="font-medium text-foreground">Listening</p>
          <p className="truncate text-xs text-muted-foreground">
            Speak naturally - tap the mic or press Esc when you are done.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ChatVoiceDictation({
  prompt,
  onPromptChange,
  isReplyStreaming,
  onListeningChange,
  onBargeIn,
  children,
}: ChatVoiceDictationProps) {
  const [hasHydrated, setHasHydrated] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const {
    browserSupportsSpeechRecognition: speechSupported,
    finalTranscript,
    interimTranscript,
    listening: isListening,
    isMicrophoneAvailable,
    resetTranscript,
  } = useSpeechRecognition();

  const dictationBaseRef = useRef("");
  const safeSpeechSupported = hasHydrated ? speechSupported : false;
  const safeIsListening = hasHydrated ? isListening : false;
  const microphoneUnavailable = safeSpeechSupported && !isMicrophoneAvailable;

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    onListeningChange?.(isListening);
  }, [isListening, onListeningChange]);

  useEffect(() => {
    return () => {
      void SpeechRecognition.abortListening();
    };
  }, []);

  useEffect(() => {
    if (!isListening) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void SpeechRecognition.stopListening();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isListening]);

  useEffect(() => {
    if (!isListening) {
      return;
    }
    const spoken = `${finalTranscript}${interimTranscript}`;
    const base = dictationBaseRef.current;
    const next =
      base && spoken.trim()
        ? `${base.replace(/\s+$/, "")} ${spoken.trimStart()}`
        : base || spoken;
    onPromptChange(next);
  }, [finalTranscript, interimTranscript, isListening, onPromptChange]);

  const toggleVoice = useCallback(() => {
    if (!safeSpeechSupported) {
      return;
    }

    setVoiceError(null);

    if (isListening) {
      void SpeechRecognition.stopListening();
      return;
    }

    void (async () => {
      if (isReplyStreaming) {
        onBargeIn?.();
      }

      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        } catch {
          setVoiceError("Microphone permission denied.");
          return;
        }
      }

      dictationBaseRef.current = prompt;
      resetTranscript();
      try {
        await SpeechRecognition.startListening({
          continuous: true,
          language: "en-US",
        });
      } catch {
        setVoiceError("Could not start voice input.");
      }
    })();
  }, [isListening, isReplyStreaming, onBargeIn, prompt, resetTranscript, safeSpeechSupported]);

  const micControl = (
    <div className="relative shrink-0">
      {safeIsListening ? (
        <>
          <span className="absolute inset-0 rounded-full bg-destructive/25 animate-ping" aria-hidden="true" />
          <span
            className="absolute inset-[-4px] rounded-full border border-destructive/30 animate-pulse"
            aria-hidden="true"
          />
        </>
      ) : null}
      <Button
        type="button"
        variant={safeIsListening ? "default" : "outline"}
        size="icon-lg"
        className={`relative size-12 shrink-0 rounded-full [&_svg]:size-5 ${
          safeIsListening
            ? "border-transparent bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90 focus-visible:border-destructive focus-visible:ring-destructive/25"
            : ""
        }`}
        disabled={!safeSpeechSupported}
        aria-pressed={safeIsListening}
        aria-label={safeIsListening ? "Stop voice input" : "Start voice input"}
        onClick={toggleVoice}
      >
        <Mic className="size-5" aria-hidden="true" />
      </Button>
    </div>
  );

  return (
    <>
      {safeIsListening ? <VoiceListeningBanner /> : null}
      {children({ isListening: safeIsListening, speechSupported: safeSpeechSupported, micControl })}
      {voiceError || microphoneUnavailable ? (
        <p className="text-xs text-destructive">
          {voiceError ?? "Microphone permission denied."}
        </p>
      ) : null}
      {!safeSpeechSupported ? (
        <p className="text-xs text-muted-foreground">Voice input requires a Chromium-based browser.</p>
      ) : null}
    </>
  );
}
