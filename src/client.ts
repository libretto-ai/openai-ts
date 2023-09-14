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
  const body = JSON.stringify(event);
  const response = await fetch(url, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
    },
  });
  const responseJson = await extractJsonBody(response);
  if (!response.ok) {
    throw new Error(`Failed to send event: ${JSON.stringify(responseJson)}`);
  }

  return responseJson;
}

export async function extractJsonBody(response: Response) {
  try {
    const responseJson = await response.json();
    return responseJson;
  } catch (e) {
    throw new Error(
      `Unparseable response: ${response.status} ${response.statusText} ${e}`
    );
  }
}
