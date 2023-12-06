import { OpenAI as _OpenAI } from "openai";
import { ClientOptions } from "openai";
import { LibrettoCompletions } from "./completions";
import { LibrettoChat } from "./chat";

export class OpenAI extends _OpenAI {
  constructor(opts?: ClientOptions) {
    super(opts);

    this.completions = new LibrettoCompletions(this, opts?.libretto ?? {});
    this.chat = new LibrettoChat(this, opts?.libretto ?? {});
  }
}
