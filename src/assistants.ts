import { OpenAI } from "openai";
import PQueue from "p-queue";
import { RunFunction } from "p-queue/dist/queue";

const LIBRETTO_THREAD_CURSOR_KEY = "libretto.cursor";

export class ThreadManager {
  protected queues: Record<string, PQueue> = {};

  constructor(protected client: OpenAI) {}

  async enqueue(threadId: string, fn: RunFunction) {
    let q = this.queues[threadId];
    if (!q) {
      q = new PQueue({ concurrency: 1 });
      this.queues[threadId] = q;
    }
    return q.add(async () => {
      try {
        await fn();
      } catch (err) {
        console.error(`[Libretto] Error processing thread: ${err}`);
      }
    });
  }

  async getCursor(threadId: string) {
    const thread = await this.client.beta.threads.retrieve(threadId);
    const threadMetadata = (thread.metadata as Record<string, any>) ?? {};
    return threadMetadata[LIBRETTO_THREAD_CURSOR_KEY] ?? "";
  }

  async setCursor(threadId: string, val: string) {
    await this.client.beta.threads.update(threadId, {
      metadata: {
        [LIBRETTO_THREAD_CURSOR_KEY]: val,
      },
    });
  }
}
