import { ChatCompletionMessage } from "openai/resources/chat";

export { OpenAI } from "./client";
export { Event, Feedback, sendFeedback, send_event } from "./session";
export { f, objectTemplate } from "./template";

export type LibrettoConfig = {
  apiKey?: string;
  promptTemplateName?: string;
  allowUnnamedPrompts?: boolean;
  redactPii?: boolean;
  chatId?: string;
};

type LibrettoCreateParams = {
  apiKey?: string;
  promptTemplateName?: string;
  templateText?: string;
  templateChat?: ChatCompletionMessage[];
  templateParams?: Record<string, any>;
  chatId?: string;
  parentEventId?: string;
  feedbackKey?: string;
  context?: Record<string, any>;
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
