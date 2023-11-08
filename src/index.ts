import { ChatCompletionMessage } from "openai/resources/chat";

export { Event, Feedback, send_event, sendFeedback } from "./client";
export { patch } from "./patch";
export { f, objectTemplate } from "./template";

type LibrettoCreateParams = {
  apiKey?: string;
  promptTemplateName?: string;
  templateText?: string;
  templateChat?: ChatCompletionMessage[];
  templateParams?: Record<string, any>;
  chatId?: string;
  parentEventId?: string;
  feedbackKey?: string;
};

type LibrettoCompletion = {
  feedbackKey?: string;
};

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
