import OpenAI from "openai";
import { Threads } from "openai/resources/beta/threads/threads";
import { LibrettoConfig } from ".";
import { LibrettoRuns } from "./runs";

export class LibrettoThreads extends Threads {
  constructor(
    client: OpenAI,
    protected config: LibrettoConfig,
  ) {
    super(client);
    // this.messages = new LibrettoMessages(client, config);
    this.runs = new LibrettoRuns(client, config);
  }
}
