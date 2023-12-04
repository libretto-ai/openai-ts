import { type CompletionCreateParamsNonStreaming } from "openai/resources";
import { type ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat";

function getUrl(apiName: string, environmentName: string): string {
  if (process.env[environmentName]) {
    return process.env[environmentName]!;
  }
  const prefix =
    process.env.LIBRETTO_API_PREFIX ?? "https://app.getlibretto.com/api";
  return `${prefix}/${apiName}`;
}

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
  params: Record<string, any>;
  /** Included after response */
  response?: string | null;
  /** Response time in ms */
  responseTime?: number;
  /** Included only if there is an error from openai, or error in validation */
  responseErrors?: string[];
  // eslint-disable-next-line @typescript-eslint/ban-types
  prompt: {}; //hack
}

export type Event = EventMetadata & PromptEvent;

export async function send_event(event: Event) {
  if (!event.apiKey) {
    return;
  }

  const url = getUrl("event", "LIBRETTO_REPORTING_URL");
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
async function extractJsonBody(response: Response) {
  try {
    const responseJson = await response.json();
    return responseJson;
  } catch (e) {
    throw new Error(
      `Unparseable response: ${response.status} ${response.statusText} ${e}`,
    );
  }
}

export interface Feedback {
  /** The feedback_key that was passed to the `event` API. */
  feedbackKey: string;
  /* A rating from 0 to 1 on the quality of the prompt response */
  rating?: number;
  /**
   * A better response than what the prompt responded with. (e.g. a correction
   * from a user)
   */
  betterResponse?: string;

  apiKey?: string;
}

/** Send feedback to the  */
export async function sendFeedback(body: Feedback) {
  // the endpoint expects snake_case variables
  const snakeCaseBody = Object.fromEntries(
    Object.entries(body).map(([k, v]) => {
      if (k === "feedbackKey") return ["feedback_key", v];
      if (k === "betterResponse") return ["better_response", v];
      return [k, v];
    }),
  );

  const url = getUrl("feedback", "LIBRETTO_FEEDBACK_URL");
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(snakeCaseBody),
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