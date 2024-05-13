import { ClientOptions, OpenAI as _OpenAI } from "openai";
import { LibrettoBeta } from "./beta";
import { LibrettoChat } from "./chat";
import { LibrettoCompletions } from "./completions";

export class OpenAI extends _OpenAI {
  constructor(opts?: ClientOptions) {
    super(opts);

    const config = opts?.libretto ?? {};
    this.completions = new LibrettoCompletions(this, config);
    this.chat = new LibrettoChat(this, config);
    this.beta = new LibrettoBeta(this, config);
  }
}
