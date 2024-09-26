import OpenAI from "openai";
import {
  type CompletionCreateParamsNonStreaming,
  type CompletionUsage,
} from "openai/resources";
import { RunCreateParamsNonStreaming } from "openai/resources/beta/threads/runs/runs";
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
interface OpenAIThreadRunParameters extends RunCreateParamsNonStreaming {
  modelProvider: "openai";
  modelType: "assistants";
}
export type ModelParameters =
  | OpenAIChatParameters
  | OpenAICompletionParameters
  | OpenAIThreadRunParameters;

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
  context?: Record<string, any>;
  tools?: any[];
}
export interface PromptEvent {
  params: Record<string, any>;
  /** Included after response */
  response?: string | null;
  /** Response time in ms */
  responseTime?: number;
  /** Included only if there is an error from openai, or error in validation */
  responseErrors?: string[];

  responseMetrics?: {
    usage: CompletionUsage | undefined;
    finish_reason:
      | OpenAI.Completions.CompletionChoice["finish_reason"]
      | OpenAI.ChatCompletion.Choice["finish_reason"]
      | undefined
      | null;
    logprobs:
      | OpenAI.Completions.CompletionChoice.Logprobs
      | OpenAI.Chat.Completions.ChatCompletion.Choice.Logprobs
      | undefined
      | null;
  };
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  prompt: {}; //hack
}

export type Event = EventMetadata & PromptEvent;

export async function send_event(event: Event) {
  if (!event.apiKey) {
    return;
  }

  const url = getUrl("event", "LIBRETTO_REPORTING_URL");
  const body = JSON.stringify(event);
  let status = 0;

  try {
    const response = await fetch(url, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
      },
    });
    status = response.status;
    const responseJson = await extractJsonBody(response);
    if (!response.ok) {
      throw new Error(`Failed to send event: ${JSON.stringify(responseJson)}`);
    }

    return responseJson;
  } catch (e) {
    // don't suppress errors if we're in debug mode OR if we get a 4xx response because we made the request wrong.
    if (
      process.env.LIBRETTO_DEBUG === "true" ||
      (status < 500 && status >= 400)
    ) {
      console.error("Failed to send event to libretto:", e);
    }
  }
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
  feedbackKey?: string;
  /* A rating from 0 to 1 on the quality of the prompt response */
  rating?: number;
  /**
   * A better response than what the prompt responded with. (e.g. a correction
   * from a user)
   */
  betterResponse?: string;

  /**
   * Indicates that an event is "deleted." Used when assistant thread messages
   * were deleted in OpenAI -- we keep the original message event but mark it
   * as deleted via feedback.
   */
  isDeleted?: boolean;

  apiKey?: string;
}

/** Send feedback to the  */
export async function sendFeedback(body: Feedback) {
  if (!body.feedbackKey) {
    console.warn("Could not send feedback to Libretto: missing feedback key");
    return;
  }

  body.apiKey = body.apiKey ?? process.env.LIBRETTO_API_KEY;
  if (!body.apiKey) {
    console.warn("Could not send feedback to Libretto: missing API key");
    return;
  }

  // the endpoint expects snake_case variables
  const snakeCaseBody = Object.fromEntries(
    Object.entries(body).map(([k, v]) => {
      if (k === "feedbackKey") return ["feedback_key", v];
      if (k === "betterResponse") return ["better_response", v];
      if (k === "isDeleted") return ["is_deleted", v];
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
