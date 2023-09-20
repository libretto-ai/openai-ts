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
  promptTemplateText?: string | null;
  promptTemplateTextId?: string;
  promptTemplateChat?: any[];
  promptTemplateName?: string;
  apiName?: string;
  apiKey?: string;
  chatId?: string;
  parentEventId?: string;
  modelParameters?: ModelParameters;
  feedbackKey?: string;
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
  prompt: {}; //hack
}

export async function send_event(event: EventMetadata & PromptEvent) {
  const url =
    process.env.PROMPT_REPORTING_URL ?? "https://app.imaginary.dev/api/event";
  const body = JSON.stringify(event);
  console.log("sending event", event);
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
async function extractJsonBody(response: Response) {
  try {
    const responseJson = await response.json();
    return responseJson;
  } catch (e) {
    throw new Error(
      `Unparseable response: ${response.status} ${response.statusText} ${e}`
    );
  }
}

export interface FeedbackBody {
  /** The feedback_key that was passed to the `event` API. */
  feedback_key: string;
  /* A rating from 0 to 1 on the quality of the prompt response */
  rating?: number;
  /**
   * A better response than what the prompt responded with. (e.g. a correction
   * from a user)
   */
  better_response?: string;

  apiKey?: string;
}

/** Send feedback to the  */
export async function send_feedback(body: FeedbackBody) {
  const url =
    process.env.PROMPT_FEEDBACK_URL ?? "https://app.imaginary.dev/api/feedback";
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
  });
  const responseJson = await extractJsonBody(response);
  if (!response.ok) {
    throw new Error(`Failed to send feedback: ${JSON.stringify(responseJson)}`);
  }

  return responseJson;
}
