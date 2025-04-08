import { ChatCompletionMessage } from "openai/resources/chat";

export { OpenAI } from "./client";
export { Event, Feedback, send_event, sendFeedback } from "./session";
export { f, objectTemplate } from "./template";

export type LibrettoConfig = {
  apiKey?: string;
  promptTemplateName?: string;
  allowUnnamedPrompts?: boolean;
  redactPii?: boolean;
  chatId?: string;
  waitForEvent?: boolean;
};

export type LibrettoCreateParams = {
  apiKey?: string;
  promptTemplateName?: string;
  templateParams?: Record<string, any>;
  templateChat?: ChatCompletionMessage[];
  chatId?: string;
  chainId?: string;
  feedbackKey?: string;
  context?: Record<string, any>;

  /** @deprecated Use chainId instead */
  parentEventId?: string;
};

//todo: should we mark these as readonly?
type LibrettoCompletion = {
  feedbackKey?: string;
  context?: Record<string, any>;
};

export type LibrettoRunCreateParams = {
  apiKey?: string;
  promptTemplateName?: string;
};

declare module "openai" {
  interface ClientOptions {
    libretto?: LibrettoConfig;
  }
}

declare module "openai/resources/chat/completions" {
  interface ChatCompletionCreateParamsBase {
    libretto?: LibrettoCreateParams;
  }

  interface ChatCompletionChunk {
    libretto?: LibrettoCompletion;
  }

  interface ChatCompletion {
    libretto?: LibrettoCompletion;
  }
}

declare module "openai/resources/completions" {
  interface CompletionCreateParamsBase {
    libretto?: LibrettoCreateParams;
  }

  interface Completion {
    libretto?: LibrettoCompletion;
  }
}

declare module "openai/resources/beta/threads/runs/runs" {
  interface RunCreateParamsBase {
    libretto?: LibrettoRunCreateParams;
  }
}
