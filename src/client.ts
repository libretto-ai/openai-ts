import _Anthropic, { ClientOptions } from "@anthropic-ai/sdk";
import { LibrettoCompletions } from "./completions";
import { LibrettoMessages } from "./messages";

export class Anthropic extends _Anthropic {
  constructor(opts?: ClientOptions) {
    super(opts);

    const config = opts?.libretto ?? {};
    this.messages = new LibrettoMessages(this, config);
    this.completions = new LibrettoCompletions(this, config);
  }
}
