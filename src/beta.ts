import OpenAI from "openai";
import { Beta } from "openai/resources/beta/beta";
import { LibrettoConfig } from ".";
import { LibrettoThreads } from "./threads";

export class LibrettoBeta extends Beta {
  constructor(
    client: OpenAI,
    protected config: LibrettoConfig,
  ) {
    super(client);
    this.threads = new LibrettoThreads(client, config);
  }
}
