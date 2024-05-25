// import { ClientOptions, OpenAI as _OpenAI } from "openai";
import _Anthropic, { ClientOptions } from "@anthropic-ai/sdk";
import { LibrettoMessages } from "./messages";

export class Anthropic extends _Anthropic {
  constructor(opts?: ClientOptions) {
    super(opts);

    const config = opts?.libretto ?? {};
    this.messages = new LibrettoMessages(this, config);
    // this.beta = new LibrettoBeta(this, config);
  }
}
