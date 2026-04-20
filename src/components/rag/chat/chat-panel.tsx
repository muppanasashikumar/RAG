import { ArrowUp, Bot, CheckCircle2, ChevronDown, Square, UserRound } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { ChatComposerInput } from "@/components/rag/chat/chat-composer-input";
import { ChatVoiceDictation } from "@/components/rag/chat/chat-voice-dictation";
import type { ChatPanelProps, Message } from "@/components/rag/chat/types";
import { Button } from "@/components/ui/button";

const SCROLL_BOTTOM_THRESHOLD_PX = 72;

export function ChatPanel({
  messages,
  insights,
  prompt,
  isReplyStreaming,
  onPromptChange,
  onInsightClick,
  onSubmit,
  onStopStreaming,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessagesRef = useRef<Message[] | null>(null);
  const isPinnedToBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const syncPinnedFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    if (el.scrollHeight <= el.clientHeight + 1) {
      isPinnedToBottomRef.current = true;
      setShowScrollToBottom(false);
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const pinned = distanceFromBottom < SCROLL_BOTTOM_THRESHOLD_PX;
    isPinnedToBottomRef.current = pinned;
    setShowScrollToBottom(!pinned);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior });
    isPinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const prev = prevMessagesRef.current;
    prevMessagesRef.current = messages;

    if (prev === null) {
      el.scrollTop = el.scrollHeight;
      isPinnedToBottomRef.current = true;
      setShowScrollToBottom(false);
      return;
    }

    const prevIds = new Set(prev.map((m) => m.id));
    const added = messages.filter((m) => !prevIds.has(m.id));
    const userSent = added.some((m) => m.role === "user");

    const conversationReplaced =
      prev.length > 0 &&
      (messages.length < prev.length || messages[0]?.id !== prev[0]?.id);

    if (conversationReplaced) {
      isPinnedToBottomRef.current = true;
    }

    const shouldAutoScroll = isPinnedToBottomRef.current || userSent;

    if (shouldAutoScroll) {
      el.scrollTop = el.scrollHeight;
      isPinnedToBottomRef.current = true;
      setShowScrollToBottom(false);
    } else {
      syncPinnedFromScroll();
    }
  }, [messages, syncPinnedFromScroll]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
        <div>
          <p className="font-heading font-semibold">Document chat</p>
          <p className="text-sm text-muted-foreground">Ask questions grounded in uploaded files.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
          {isReplyStreaming ? (
            <>
              <span
                className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin"
                aria-hidden="true"
              />
              Streaming
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
              Ready
            </>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          onScroll={syncPinnedFromScroll}
          className="h-full min-h-0 space-y-5 overflow-y-auto px-5 py-6"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" ? (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Bot className="size-4" aria-hidden="true" />
                </div>
              ) : null}

              <div
                className={`max-w-[760px] rounded-lg border px-4 py-3 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-card-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {message.content}
                  {message.role === "assistant" && message.isStreaming ? (
                    <span className="ml-0.5 inline-block w-2 animate-pulse align-text-bottom text-primary" aria-hidden="true">
                      ▍
                    </span>
                  ) : null}
                </p>
                {message.citations ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.citations.map((citation) => (
                      <span
                        key={citation}
                        className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground"
                      >
                        {citation}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {message.role === "user" ? (
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card">
                  <UserRound className="size-4" aria-hidden="true" />
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {showScrollToBottom ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="pointer-events-auto rounded-full border-border/80 bg-background/95 shadow-md backdrop-blur-sm hover:bg-muted"
              aria-label="Scroll to latest message"
              onClick={() => scrollToBottom("smooth")}
            >
              <ChevronDown className="size-5" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {insights.map((insight) => (
            <button
              key={insight}
              type="button"
              onClick={() => onInsightClick(insight)}
              className="rounded-md border bg-card px-3 py-1.5 text-xs font-medium transition hover:border-ring hover:bg-muted"
            >
              {insight}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <ChatVoiceDictation
            prompt={prompt}
            onPromptChange={onPromptChange}
            isReplyStreaming={isReplyStreaming}
          >
            {({ isListening, micControl }) => (
              <div className="flex gap-2">
                <ChatComposerInput
                  value={prompt}
                  onChange={onPromptChange}
                  readOnly={isReplyStreaming || isListening}
                  isListening={isListening}
                  idlePlaceholder="Ask about obligations, risks, timelines, definitions..."
                  listeningPlaceholder="Transcript appears here as you speak..."
                />
                {micControl}
                {isReplyStreaming ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-12 shrink-0 gap-2 px-4"
                    aria-label="Stop generating"
                    onClick={onStopStreaming}
                  >
                    <Square className="size-3.5 fill-current" aria-hidden="true" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    className="h-12 shrink-0 gap-2 px-4"
                    type="submit"
                    disabled={!prompt.trim() || isListening}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                    Send
                  </Button>
                )}
              </div>
            )}
          </ChatVoiceDictation>
        </form>
      </div>
    </div>
  );
}
