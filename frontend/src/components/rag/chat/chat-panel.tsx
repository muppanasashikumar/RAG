import { ArrowUp, Bot, CheckCircle2, ChevronDown, Square, UserRound } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ChatComposerInput } from "@/components/rag/chat/chat-composer-input";
import { ChatVoiceDictation } from "@/components/rag/chat/chat-voice-dictation";
import type { ChatPanelProps, Message } from "@/components/rag/chat/types";
import { Button } from "@/components/ui/button";

const SCROLL_BOTTOM_THRESHOLD_PX = 72;

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

export function ChatPanel({
  messages,
  prompt,
  isReplyStreaming,
  isIndexingDocuments,
  onPromptChange,
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
          ) : isIndexingDocuments ? (
            <>
              <span
                className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin"
                aria-hidden="true"
              />
              Indexing docs
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
                {message.role === "assistant" ? (
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
                {message.citations ? (
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
                ) : null}
                {message.role === "assistant" && message.retrievalMode ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Retrieval mode: <span className="font-medium">{message.retrievalMode}</span>
                  </p>
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
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          {isIndexingDocuments ? (
            <p className="text-xs text-muted-foreground">
              Documents are still indexing. You can ask now, but responses may not include the newly uploaded files yet.
            </p>
          ) : null}
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
