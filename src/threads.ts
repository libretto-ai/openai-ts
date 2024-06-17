import OpenAI from "openai";
import { Threads } from "openai/resources/beta/threads/threads";
import { LibrettoConfig } from ".";
import { ThreadManager } from "./assistants";
import { LibrettoMessages } from "./messages";
import { LibrettoRuns } from "./runs";

export class LibrettoThreads extends Threads {
  constructor(
    protected client: OpenAI,
    protected config: LibrettoConfig,
  ) {
    super(client);

    const threadManager = new ThreadManager(client);

    this.runs = new LibrettoRuns(client, config, threadManager);
    this.messages = new LibrettoMessages(client, config, threadManager);
  }
}
