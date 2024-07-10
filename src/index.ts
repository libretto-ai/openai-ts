import _Anthropic from "@anthropic-ai/sdk";
export { Anthropic } from "./client";
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
  templateChat?: _Anthropic.Message[];
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

declare module "@anthropic-ai/sdk" {
  interface ClientOptions {
    libretto?: LibrettoConfig;
  }
}

declare module "@anthropic-ai/sdk/resources/messages" {
  interface MessageCreateParamsBase {
    libretto?: LibrettoCreateParams;
  }

  interface Message {
    libretto?: LibrettoCompletion;
  }

  interface RawMessageStartEvent {
    libretto?: LibrettoCompletion;
  }
  interface RawMessageDeltaEvent {
    libretto?: LibrettoCompletion;
  }
  interface RawMessageStopEvent {
    libretto?: LibrettoCompletion;
  }
  interface RawContentBlockStartEvent {
    libretto?: LibrettoCompletion;
  }

  interface RawContentBlockDeltaEvent {
    libretto?: LibrettoCompletion;
  }
  interface RawContentBlockStopEvent {
    libretto?: LibrettoCompletion;
  }
}

declare module "@anthropic-ai/sdk/resources/completions" {
  interface CompletionCreateParamsBase {
    libretto?: LibrettoCreateParams;
  }

  interface Completion {
    libretto?: LibrettoCompletion;
  }
}
