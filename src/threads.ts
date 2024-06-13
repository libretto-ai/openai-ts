import OpenAI from "openai";
import { Threads } from "openai/resources/beta/threads/threads";
import { LibrettoConfig } from ".";
import { LibrettoMessages } from "./messages";
import { LibrettoRuns } from "./runs";

const LIBRETTO_THREAD_CURSOR_KEY = "libretto.cursor";

export class LibrettoThreads extends Threads {
  constructor(
    protected client: OpenAI,
    protected config: LibrettoConfig,
  ) {
    super(client);
    this.runs = new LibrettoRuns(client, config);
    this.messages = new LibrettoMessages(client, config);
  }

  public async getCursor(threadId: string) {
    const thread = await this.client.beta.threads.retrieve(threadId);
    const threadMetadata = (thread.metadata as Record<string, any>) ?? {};
    return threadMetadata[LIBRETTO_THREAD_CURSOR_KEY] ?? "";
  }

  public async setCursor(threadId: string, val: string) {
    await this.client.beta.threads.update(threadId, {
      metadata: {
        [LIBRETTO_THREAD_CURSOR_KEY]: val,
      },
    });
  }
}
