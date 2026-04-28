import type { ActiveStreamSession } from "@/stores/chat-store.typings";

type StreamRuntime = {
  controller: AbortController;
  reader?: ReadableStreamDefaultReader<Uint8Array>;
  session: ActiveStreamSession;
};

/**
 * Keeps stream lifecycle state in one place so chat stores stay easy to read.
 * One chat can have one active stream, and many chats can stream in parallel.
 */
export class StreamManager {
  private readonly runtimes = new Map<string, StreamRuntime>();
  private readonly stopRequests = new Set<string>();

  hasActiveStream(chatId: string) {
    return this.runtimes.has(chatId);
  }

  start(chatId: string, session: ActiveStreamSession): AbortController {
    const existing = this.runtimes.get(chatId);
    if (existing) {
      this.cancel(chatId);
    }
    this.stopRequests.delete(chatId);
    const controller = new AbortController();
    this.runtimes.set(chatId, { controller, session });
    return controller;
  }

  getController(chatId: string): AbortController | undefined {
    return this.runtimes.get(chatId)?.controller;
  }

  getSession(chatId: string): ActiveStreamSession | undefined {
    return this.runtimes.get(chatId)?.session;
  }

  updateSession(chatId: string, updater: (session: ActiveStreamSession) => ActiveStreamSession) {
    const runtime = this.runtimes.get(chatId);
    if (!runtime) {
      return;
    }
    this.runtimes.set(chatId, {
      ...runtime,
      session: updater(runtime.session),
    });
  }

  setReader(chatId: string, reader: ReadableStreamDefaultReader<Uint8Array> | undefined) {
    const runtime = this.runtimes.get(chatId);
    if (!runtime) {
      return;
    }
    this.runtimes.set(chatId, {
      ...runtime,
      reader,
    });
  }

  markStopRequested(chatId: string) {
    this.stopRequests.add(chatId);
  }

  wasStopRequested(chatId: string) {
    return this.stopRequests.has(chatId);
  }

  clearStopRequested(chatId: string) {
    this.stopRequests.delete(chatId);
  }

  cancel(chatId: string) {
    const runtime = this.runtimes.get(chatId);
    if (!runtime) {
      return;
    }
    runtime.controller.abort();
    if (runtime.reader) {
      void runtime.reader.cancel().catch(() => undefined);
    }
  }

  end(chatId: string, expectedController?: AbortController) {
    const runtime = this.runtimes.get(chatId);
    if (!runtime) {
      this.stopRequests.delete(chatId);
      return;
    }
    if (expectedController && runtime.controller !== expectedController) {
      return;
    }
    this.runtimes.delete(chatId);
    this.stopRequests.delete(chatId);
  }

  cancelAll() {
    for (const chatId of this.runtimes.keys()) {
      this.cancel(chatId);
    }
    this.runtimes.clear();
    this.stopRequests.clear();
  }
}
