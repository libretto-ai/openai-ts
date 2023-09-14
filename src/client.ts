import { fetch } from "openai/_shims/fetch-node";
import { type CompletionCreateParamsNonStreaming } from "openai/resources";
import { type ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat";

interface OpenAIChatParameters
  extends Omit<ChatCompletionCreateParamsNonStreaming, "messages"> {
  modelProvider: "openai";
  modelType: "chat";
}
interface OpenAICompletionParameters
  extends Omit<CompletionCreateParamsNonStreaming, "prompt"> {
  modelProvider: "openai";
  modelType: "completion";
}
export type ModelParameters = OpenAIChatParameters | OpenAICompletionParameters;

/**
 *
 */
export interface EventMetadata {
  promptTemplateText?: string;
  promptTemplateTextId?: string;
  promptTemplateChat?: any[];
  apiName?: string;
  apiKey?: string;
  chatId?: string;
  parentEventId?: string;
  modelParameters?: ModelParameters;
}
export interface PromptEvent {
  /** From @imaginary-dev/core */
  /* prompt: ImaginaryFunctionDefinition; */
  params: Record<string, any>;
  /** Unique Id linking prompt with reply */
  promptEventId?: string;
  /** Included after response */
  response?: string | null;
  /** Response time in ms */
  responseTime?: number;
  /** Included only if there is an error from openai, or error in validation */
  responseErrors?: string[];
}

export async function send_event(event: EventMetadata & PromptEvent) {
  const url =
    process.env.PROMPT_REPORTING_URL ?? "https://app.imaginary.dev/api/event";
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(event),
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error("Failed to send event");
  }

  return response.json();
}
