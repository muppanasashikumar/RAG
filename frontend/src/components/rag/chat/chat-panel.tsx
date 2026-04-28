import { ArrowUp, Bot, Check, CheckCircle2, ChevronDown, Copy, Share2, Square, ThumbsDown, ThumbsUp, UserRound, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ChatComposerInput } from "@/components/rag/chat/chat-composer-input";
import { ChatVoiceDictation } from "@/components/rag/chat/chat-voice-dictation";
import type { ChatPanelProps, Message } from "@/components/rag/chat/types";
import { Button } from "@/components/ui/button";
import { buildBackendUrl } from "@/stores/chat-store.helpers";

const SCROLL_BOTTOM_THRESHOLD_PX = 72;
const CHAT_PANEL_TITLE = "Document chat";
const CHAT_PANEL_SUBTITLE = "Ask questions grounded in uploaded files.";
const INDEXING_HINT =
  "Documents are still indexing. You can ask now, but responses may not include the newly uploaded files yet.";
function getCitationFilename(pdfLinkWithPage: string, fallback: string): string {
  if (!pdfLinkWithPage) {
    return fallback;
  }
  const withoutHash = pdfLinkWithPage.split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  const segments = withoutQuery.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1];
  if (!lastSegment) {
    return fallback;
  }
  return decodeURIComponent(lastSegment);
}

function AssistantMarkdown({ content }: { content: string }) {
  const normalizedContent = content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return (
    <div className="text-sm leading-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-md [&_table]:border [&_th]:border [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:px-3 [&_td]:py-2 [&_thead_tr]:border-b [&_tbody_tr:nth-child(even)]:bg-muted/30">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2" />
          ),
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}

function ChatStatusBadge({
  isReplyStreaming,
  isIndexingDocuments,
}: Pick<ChatPanelProps, "isReplyStreaming" | "isIndexingDocuments">) {
  if (isReplyStreaming) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
        <span
          className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin"
          aria-hidden="true"
        />
        Streaming
      </div>
    );
  }

  if (isIndexingDocuments) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
        <span
          className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin"
          aria-hidden="true"
        />
        Indexing docs
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
      <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
      Ready
    </div>
  );
}

function MessageCitations({ message }: { message: Message }) {
  if (!message.citations) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {message.citations.map((citation) => {
        const sourceName = citation.sourceFilename
          ? citation.sourceFilename
          : getCitationFilename(citation.pdfLinkWithPage, citation.documentId);
        const label = `[${citation.citationId ?? "?"}] ${sourceName} ${
          citation.pageNumber ? `(p.${citation.pageNumber})` : ""
        }`;
        const key = `${message.id}-${citation.citationId ?? "unknown"}-${citation.pageNumber ?? "unknown"}`;
        if (!citation.pdfLinkWithPage) {
          return (
            <span key={key} className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
              {label}
            </span>
          );
        }
        return (
          <a
            key={key}
            href={citation.pdfLinkWithPage}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:border-ring hover:text-foreground"
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}

type MessageFeedback = "like" | "dislike" | null;

function MessageActions({ message, activeChatId }: { message: Message; activeChatId: string }) {
  const [feedback, setFeedback] = useState<MessageFeedback>(message.feedback ?? null);
  const [copied, setCopied] = useState(false);
  const canPersist = Boolean(activeChatId && activeChatId !== "new" && message.serverMessageId);

  useEffect(() => {
    setFeedback(message.feedback ?? null);
  }, [message.feedback]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setCopied(false);
    }, 1400);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [copied]);

  const toggleFeedback = useCallback((value: Exclude<MessageFeedback, null>) => {
    setFeedback((current) => (current === value ? null : value));
  }, []);

  const persistFeedback = useCallback(
    async (nextFeedback: MessageFeedback) => {
      if (!canPersist || !message.serverMessageId || !activeChatId || activeChatId === "new") {
        return;
      }
      await fetch(
        buildBackendUrl(
          `/rag/chats/${encodeURIComponent(activeChatId)}/messages/${encodeURIComponent(message.serverMessageId)}/feedback`,
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback: nextFeedback }),
        },
      );
    },
    [activeChatId, canPersist, message.serverMessageId],
  );

  const trackAction = useCallback(
    async (action: "copy" | "share") => {
      if (!canPersist || !message.serverMessageId || !activeChatId || activeChatId === "new") {
        return;
      }
      await fetch(
        buildBackendUrl(
          `/rag/chats/${encodeURIComponent(activeChatId)}/messages/${encodeURIComponent(message.serverMessageId)}/actions`,
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
    },
    [activeChatId, canPersist, message.serverMessageId],
  );

  const handleFeedbackClick = useCallback(
    async (value: Exclude<MessageFeedback, null>) => {
      const nextFeedback = feedback === value ? null : value;
      toggleFeedback(value);
      try {
        await persistFeedback(nextFeedback);
      } catch {
        setFeedback(feedback);
      }
    },
    [feedback, persistFeedback, toggleFeedback],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      void trackAction("copy");
    } catch {
      setCopied(false);
    }
  }, [message.content, trackAction]);

  const handleShare = useCallback(async () => {
    const sharePayload = {
      title: "Chat response",
      text: message.content,
      url: window.location.href,
    };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(sharePayload);
        void trackAction("share");
        return;
      } catch {
        // Fall through to clipboard copy when share is cancelled/unsupported by browser.
      }
    }
    await navigator.clipboard.writeText(`${message.content}\n\n${window.location.href}`);
    setCopied(true);
    void trackAction("share");
  }, [message.content, trackAction]);

  return (
    <div className="mt-2 flex items-center gap-1 text-muted-foreground">
      <Button
        type="button"
        variant={feedback === "like" ? "secondary" : "ghost"}
        size="icon-xs"
        aria-label="Like response"
        title="Like"
        onClick={() => {
          void handleFeedbackClick("like");
        }}
      >
        <ThumbsUp className="size-3.5" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant={feedback === "dislike" ? "secondary" : "ghost"}
        size="icon-xs"
        aria-label="Dislike response"
        title="Dislike"
        onClick={() => {
          void handleFeedbackClick("dislike");
        }}
      >
        <ThumbsDown className="size-3.5" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant={copied ? "secondary" : "ghost"}
        size="icon-xs"
        aria-label="Copy response"
        title="Copy"
        onClick={handleCopy}
      >
        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Share response" title="Share" onClick={handleShare}>
        <Share2 className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

function ChatMessageRow({ message, activeChatId }: { message: Message; activeChatId: string }) {
  const isUserMessage = message.role === "user";
  const isAssistantMessage = message.role === "assistant";

  return (
    <div className={`flex gap-3 ${isUserMessage ? "justify-end" : "justify-start"}`}>
      {isAssistantMessage ? (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-4" aria-hidden="true" />
        </div>
      ) : null}

      <div
        className={`max-w-[760px] rounded-lg border px-4 py-3 ${
          isUserMessage ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground"
        }`}
      >
        {isAssistantMessage ? (
          <div className="relative">
            <AssistantMarkdown content={message.content} />
            {message.isStreaming ? (
              <span className="ml-0.5 inline-block w-2 animate-pulse align-text-bottom text-primary" aria-hidden="true">
                ▍
              </span>
            ) : null}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
        )}
        <MessageCitations message={message} />
        {isAssistantMessage && !message.isStreaming ? <MessageActions message={message} activeChatId={activeChatId} /> : null}
        {isAssistantMessage && message.retrievalMode ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Retrieval mode: <span className="font-medium">{message.retrievalMode}</span>
          </p>
        ) : null}
      </div>

      {isUserMessage ? (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card">
          <UserRound className="size-4" aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
}

export function ChatPanel({
  activeChatId,
  messages,
  prompt,
  isReplyStreaming,
  isIndexingDocuments,
  isTtsEnabled,
  onPromptChange,
  onSubmit,
  onStopStreaming,
  onTtsEnabledChange,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessagesRef = useRef<Message[] | null>(null);
  const isPinnedToBottomRef = useRef(true);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);

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

  const stopAssistantSpeech = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    activeUtteranceRef.current = null;
  }, []);

  const readLatestAssistantMessage = useCallback(() => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof window.SpeechSynthesisUtterance !== "function"
    ) {
      return;
    }

    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && !message.isStreaming && message.content.trim().length > 0);

    if (!latestAssistantMessage) {
      return;
    }

    stopAssistantSpeech();
    const utterance = new window.SpeechSynthesisUtterance(latestAssistantMessage.content);
    utterance.onend = () => {
      if (activeUtteranceRef.current === utterance) {
        activeUtteranceRef.current = null;
      }
      onTtsEnabledChange(false);
    };
    utterance.onerror = () => {
      if (activeUtteranceRef.current === utterance) {
        activeUtteranceRef.current = null;
      }
      onTtsEnabledChange(false);
    };

    activeUtteranceRef.current = utterance;
    onTtsEnabledChange(true);
    window.speechSynthesis.speak(utterance);
  }, [messages, onTtsEnabledChange, stopAssistantSpeech]);

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

  useEffect(() => {
    return () => {
      stopAssistantSpeech();
    };
  }, [stopAssistantSpeech]);

  useEffect(() => {
    if (!isVoiceListening) {
      return;
    }
    stopAssistantSpeech();
  }, [isVoiceListening, stopAssistantSpeech]);

  useEffect(() => {
    if (isTtsEnabled) {
      return;
    }
    stopAssistantSpeech();
  }, [isTtsEnabled, stopAssistantSpeech]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
        <div>
          <p className="font-heading font-semibold">{CHAT_PANEL_TITLE}</p>
          <p className="text-sm text-muted-foreground">{CHAT_PANEL_SUBTITLE}</p>
        </div>
        <ChatStatusBadge isReplyStreaming={isReplyStreaming} isIndexingDocuments={isIndexingDocuments} />
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
            <ChatMessageRow key={message.id} message={message} activeChatId={activeChatId} />
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
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          {isIndexingDocuments ? (
            <p className="text-xs text-muted-foreground">{INDEXING_HINT}</p>
          ) : null}
          <ChatVoiceDictation
            prompt={prompt}
            onPromptChange={onPromptChange}
            isReplyStreaming={isReplyStreaming}
            onListeningChange={setIsVoiceListening}
            onBargeIn={onStopStreaming}
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
                <Button
                  type="button"
                  variant={isTtsEnabled ? "outline" : "secondary"}
                  size="sm"
                  className="h-12 shrink-0 gap-2 rounded-full px-3"
                  aria-label={isTtsEnabled ? "Read aloud on" : "Read aloud off"}
                  title={isTtsEnabled ? "Read aloud on" : "Read aloud off"}
                  onClick={() => {
                    if (isTtsEnabled) {
                      onTtsEnabledChange(false);
                      stopAssistantSpeech();
                      return;
                    }
                    if (!isReplyStreaming && !isVoiceListening) {
                      readLatestAssistantMessage();
                    }
                  }}
                >
                  {isTtsEnabled ? (
                    <Volume2 className="size-5" aria-hidden="true" />
                  ) : (
                    <VolumeX className="size-5" aria-hidden="true" />
                  )}
                  <span className="text-xs font-medium">{isTtsEnabled ? "On" : "Off"}</span>
                </Button>
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
